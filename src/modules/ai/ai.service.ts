import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { AiTaskType, AiTaskStatus } from "@prisma/client";
import { GeminiProvider } from "./providers/gemini.provider.js";
import { GroqProvider } from "./providers/groq.provider.js";
import {
  IGenerateSlogansInput,
  ISloganGenerationResult,
  ISloganItem,
  ICreateAiTaskInput,
  IRemoveBackgroundInput,
  IAuthContext,
} from "./ai.interface.js";
import { sanitizeLogData } from "./ai.utils.js";

type HttpError = Error & { statusCode?: number };

const httpError = (statusCode: number, message: string): HttpError => {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  return error;
};

class AiService {
  private geminiProvider = new GeminiProvider();
  private groqProvider = new GroqProvider();

  /**
   * Generates catchy political slogans with multi-provider failover (Gemini -> Groq).
   * Automatically tracks the full AiTask lifecycle in PostgreSQL with strict idempotency.
   * Note: Slogans are free (unitsCharged: 0) as agreed. Charges apply on poster download.
   */
  public async generateSlogans(
    input: IGenerateSlogansInput,
    authContext: IAuthContext = {}
  ): Promise<ISloganGenerationResult> {
    const idempotencyKey =
      input.idempotencyKey || `slogan_${crypto.randomUUID()}`;

    // 1. Check existing task with this idempotency key
    const existingTask = await prisma.aiTask.findUnique({
      where: { idempotencyKey },
    });

    if (existingTask) {
      if (existingTask.status === AiTaskStatus.SUCCEEDED) {
        const resultJson = existingTask.result as { slogans?: ISloganItem[] } | null;
        return {
          taskId: existingTask.id,
          provider: (existingTask.provider as "gemini" | "groq") || "gemini",
          model: existingTask.model || "cached",
          slogans: resultJson?.slogans || [],
          unitsCharged: existingTask.unitsCharged,
        };
      }

      if (
        existingTask.status === AiTaskStatus.PENDING ||
        existingTask.status === AiTaskStatus.PROCESSING
      ) {
        throw httpError(409, "A slogan generation task with this idempotency key is currently processing");
      }
    }

    // 2. Validate foreign keys defensively so invalid headers never throw DB constraint errors
    let validUserId: string | null = null;
    let validGuestSessionId: string | null = null;

    if (authContext.userId) {
      const userExists = await prisma.user.findUnique({
        where: { id: authContext.userId },
        select: { id: true },
      });
      if (userExists) validUserId = userExists.id;
    }

    if (authContext.guestSessionId) {
      const guestExists = await prisma.guestSession.findUnique({
        where: { id: authContext.guestSessionId },
        select: { id: true },
      });
      if (guestExists) validGuestSessionId = guestExists.id;
    }

    // 3. Create initial PENDING AiTask record (free slogan, unitsCharged: 0)
    const task = await prisma.aiTask.create({
      data: {
        idempotencyKey,
        userId: validUserId,
        guestSessionId: validGuestSessionId,
        type: AiTaskType.CAPTION_SUGGESTION,
        status: AiTaskStatus.PROCESSING,
        input: input as any,
        unitsCharged: 0,
      },
    });

    let slogans: ISloganItem[] = [];
    let providerUsed: "gemini" | "groq" = "gemini";
    let modelUsed = "";

    try {
      // 4. Attempt generation using Gemini as primary provider
      if (this.geminiProvider.isConfigured()) {
        try {
          const res = await this.geminiProvider.generateSlogans(input);
          slogans = res.slogans;
          providerUsed = "gemini";
          modelUsed = res.model;
        } catch (geminiErr: any) {
          console.warn(
            `[AiService] Primary provider (Gemini) failed: ${geminiErr?.message}. Initiating Groq fallback...`
          );
        }
      }

      // 5. Fallback to Groq if Gemini failed or was unconfigured
      if (slogans.length === 0) {
        if (!this.groqProvider.isConfigured()) {
          throw httpError(503, "All AI providers are currently unconfigured or unavailable");
        }

        const res = await this.groqProvider.generateSlogans(input);
        slogans = res.slogans;
        providerUsed = "groq";
        modelUsed = res.model;
      }

      // 6. Update task to SUCCEEDED
      await prisma.aiTask.update({
        where: { id: task.id },
        data: {
          status: AiTaskStatus.SUCCEEDED,
          provider: providerUsed,
          model: modelUsed,
          result: { slogans } as any,
          unitsCharged: 0,
          completedAt: new Date(),
        },
      });

      return {
        taskId: task.id,
        provider: providerUsed,
        model: modelUsed,
        slogans,
        unitsCharged: 0,
      };
    } catch (error: any) {
      console.error("[AiService] Slogan generation failed:", error?.message || error);

      // Record failure in database
      await prisma.aiTask.update({
        where: { id: task.id },
        data: {
          status: AiTaskStatus.FAILED,
          errorCode: (error?.message || "AI_GENERATION_FAILED").slice(0, 100),
          completedAt: new Date(),
        },
      }).catch((dbErr) => {
        console.error("[AiService] Failed to record FAILED task status in DB:", dbErr);
      });

      throw httpError(
        error?.statusCode || 500,
        error?.message || "Failed to generate slogans. Please try again."
      );
    }
  }

  /**
   * Enqueues a generic long-running AI task into the background worker queue.
   * Returns immediately with task ID and PENDING status.
   */
  public async enqueueTask(
    input: ICreateAiTaskInput,
    authContext: IAuthContext = {}
  ): Promise<{ taskId: string; status: AiTaskStatus; idempotencyKey: string }> {
    const idempotencyKey =
      input.idempotencyKey || `task_${crypto.randomUUID()}`;

    // Check idempotency
    const existing = await prisma.aiTask.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      return {
        taskId: existing.id,
        status: existing.status,
        idempotencyKey: existing.idempotencyKey,
      };
    }

    // Defensive FK check
    let validUserId: string | null = null;
    let validGuestSessionId: string | null = null;

    if (authContext.userId) {
      const userExists = await prisma.user.findUnique({
        where: { id: authContext.userId },
        select: { id: true },
      });
      if (userExists) validUserId = userExists.id;
    }

    if (authContext.guestSessionId) {
      const guestExists = await prisma.guestSession.findUnique({
        where: { id: authContext.guestSessionId },
        select: { id: true },
      });
      if (guestExists) validGuestSessionId = guestExists.id;
    }

    const task = await prisma.aiTask.create({
      data: {
        idempotencyKey,
        userId: validUserId,
        guestSessionId: validGuestSessionId,
        type: input.type,
        status: AiTaskStatus.PENDING,
        input: sanitizeLogData(input.input) as any,
        unitsCharged: 0,
      },
    });

    return {
      taskId: task.id,
      status: task.status,
      idempotencyKey: task.idempotencyKey,
    };
  }

  /**
   * Specialized enqueue for async background removal
   */
  public async enqueueBackgroundRemoval(
    input: IRemoveBackgroundInput,
    authContext: IAuthContext = {}
  ) {
    return this.enqueueTask(
      {
        type: AiTaskType.BACKGROUND_REMOVAL,
        input: {
          imageUrl: input.imageUrl,
          outputFormat: input.outputFormat || "png",
        },
        idempotencyKey: input.idempotencyKey,
      },
      authContext
    );
  }

  /**
   * Retrieves status and result of a specific AI task with strict ownership protection.
   * Only the task creator (matching userId or guestSessionId) or an ADMIN can view the result.
   */
  public async getTaskById(id: string, authContext: IAuthContext = {}) {
    const task = await prisma.aiTask.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        guestSessionId: true,
        type: true,
        status: true,
        provider: true,
        model: true,
        input: true,
        result: true,
        errorCode: true,
        unitsCharged: true,
        createdAt: true,
        completedAt: true,
      },
    });

    if (!task) {
      throw httpError(404, "AI task not found");
    }

    // Ownership verification
    const isUserOwner = Boolean(task.userId && authContext.userId && task.userId === authContext.userId);
    const isGuestOwner = Boolean(
      task.guestSessionId &&
      authContext.guestSessionId &&
      task.guestSessionId === authContext.guestSessionId
    );
    const isAdmin = authContext.role === "ADMIN";

    // If task was created by a specific user or guest session, enforce matching ownership
    if ((task.userId || task.guestSessionId) && !isUserOwner && !isGuestOwner && !isAdmin) {
      throw httpError(403, "Forbidden: You do not have permission to view this task result");
    }

    // Strip internal IDs from response
    const { userId, guestSessionId, ...safeTask } = task;
    return safeTask;
  }
}

export const aiService = new AiService();
