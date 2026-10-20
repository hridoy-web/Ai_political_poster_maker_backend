import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { AiTaskType, AiTaskStatus } from "@prisma/client";
import { GeminiProvider } from "./providers/gemini.provider.js";
import { GroqProvider } from "./providers/groq.provider.js";
import {
  IGenerateSlogansInput,
  ISloganGenerationResult,
  ISloganItem,
} from "./ai.interface.js";

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
   */
  public async generateSlogans(
    input: IGenerateSlogansInput,
    authContext: { userId?: string; guestSessionId?: string } = {}
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

      if (existingTask.status === AiTaskStatus.PENDING) {
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

    // 3. Create PENDING AiTask record
    const task = await prisma.aiTask.create({
      data: {
        idempotencyKey,
        userId: validUserId,
        guestSessionId: validGuestSessionId,
        type: AiTaskType.CAPTION_SUGGESTION,
        status: AiTaskStatus.PENDING,
        input: input as any,
        unitsCharged: 0,
      },
    });

    let slogans: ISloganItem[] = [];
    let providerUsed: "gemini" | "groq" = "gemini";
    let modelUsed = "";

    try {
      // 3. Attempt generation using Gemini as primary provider
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

      // 4. Fallback to Groq if Gemini failed or was unconfigured
      if (slogans.length === 0) {
        if (!this.groqProvider.isConfigured()) {
          throw httpError(503, "All AI providers are currently unconfigured or unavailable");
        }

        const res = await this.groqProvider.generateSlogans(input);
        slogans = res.slogans;
        providerUsed = "groq";
        modelUsed = res.model;
      }

      // 5. Update task to SUCCEEDED and charge units
      const unitsCharged = 1;
      await prisma.aiTask.update({
        where: { id: task.id },
        data: {
          status: AiTaskStatus.SUCCEEDED,
          provider: providerUsed,
          model: modelUsed,
          result: { slogans } as any,
          unitsCharged,
          completedAt: new Date(),
        },
      });

      return {
        taskId: task.id,
        provider: providerUsed,
        model: modelUsed,
        slogans,
        unitsCharged,
      };
    } catch (error: any) {
      console.error("[AiService] Slogan generation failed:", error);

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
   * Retrieves status and result of a specific AI task.
   */
  public async getTaskById(id: string) {
    const task = await prisma.aiTask.findUnique({
      where: { id },
      select: {
        id: true,
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

    return task;
  }
}

export const aiService = new AiService();
