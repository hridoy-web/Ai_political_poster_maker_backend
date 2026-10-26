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
import { ApiError } from "../../utils/ApiError.js";

class AiService {
  private geminiProvider = new GeminiProvider();
  private groqProvider = new GroqProvider();

  /**
   * Generates campaign slogans using multi-provider failover (Gemini -> Groq).
   * Note: Slogans are unmetered (unitsCharged: 0); billable units apply at final poster render.
   */
  public async generateSlogans(
    input: IGenerateSlogansInput,
    authContext: IAuthContext = {}
  ): Promise<ISloganGenerationResult> {
    const idempotencyKey =
      input.idempotencyKey || `slogan_${crypto.randomUUID()}`;

    // 1. Idempotency validation
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
        throw new ApiError(409, "A slogan generation task with this idempotency key is currently processing");
      }
    }

    // 2. Defensive foreign key resolution
    const { validUserId, validGuestSessionId } = await this.resolveValidForeignKeys(authContext);

    // 3. Initialize task record
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
      // 4. Primary Provider: Gemini
      if (this.geminiProvider.isConfigured()) {
        try {
          const res = await this.geminiProvider.generateSlogans(input);
          slogans = res.slogans;
          providerUsed = "gemini";
          modelUsed = res.model;
        } catch (geminiErr: any) {
          console.warn(
            `[AiService] Primary provider failed: ${geminiErr?.message}. Initiating fallback provider...`
          );
        }
      }

      // 5. Fallback Provider: Groq
      if (slogans.length === 0) {
        if (!this.groqProvider.isConfigured()) {
          throw new ApiError(503, "All AI providers are currently unconfigured or unavailable");
        }

        const res = await this.groqProvider.generateSlogans(input);
        slogans = res.slogans;
        providerUsed = "groq";
        modelUsed = res.model;
      }

      // 6. Finalize successful task
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

      throw new ApiError(
        error?.statusCode || 500,
        error?.message || "Failed to generate slogans. Please try again."
      );
    }
  }

  /**
   * Enqueues an asynchronous AI task into the database worker queue.
   */
  public async enqueueTask(
    input: ICreateAiTaskInput,
    authContext: IAuthContext = {}
  ): Promise<{ taskId: string; status: AiTaskStatus; idempotencyKey: string }> {
    const idempotencyKey =
      input.idempotencyKey || `task_${crypto.randomUUID()}`;

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

    const { validUserId, validGuestSessionId } = await this.resolveValidForeignKeys(authContext);

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
   * Specialized enqueue for async background removal.
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
   * Retrieves task execution status and result with creator ownership validation.
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
      throw new ApiError(404, "AI task not found");
    }

    // Enforce creator ownership
    const isUserOwner = Boolean(task.userId && authContext.userId && task.userId === authContext.userId);
    const isGuestOwner = Boolean(
      task.guestSessionId &&
      authContext.guestSessionId &&
      task.guestSessionId === authContext.guestSessionId
    );
    const isAdmin = authContext.role === "ADMIN";

    // UPDATED: আগের condition-এ userId ও guestSessionId দুটোই null হলে ownership check বাদ পড়ত।
    // এখন task-এর owner বা admin না হলে access বন্ধ থাকবে।
    if (!isUserOwner && !isGuestOwner && !isAdmin) {
      throw new ApiError(403, "Forbidden: You do not have permission to view this task result");
    }

    const { userId, guestSessionId, ...safeTask } = task;
    return safeTask;
  }

  /**
   * Validates foreign keys against active database rows to prevent constraint violations.
   */
  private async resolveValidForeignKeys(authContext: IAuthContext): Promise<{
    validUserId: string | null;
    validGuestSessionId: string | null;
  }> {
    let validUserId: string | null = null;
    let validGuestSessionId: string | null = null;

    if (authContext.userId) {
      const user = await prisma.user.findUnique({
        where: { id: authContext.userId },
        select: { id: true },
      });
      if (user) validUserId = user.id;
    }

    if (authContext.guestSessionId) {
      const guest = await prisma.guestSession.findUnique({
        where: { id: authContext.guestSessionId },
        select: { id: true },
      });
      if (guest) validGuestSessionId = guest.id;
    }

    return { validUserId, validGuestSessionId };
  }
}

export const aiService = new AiService();