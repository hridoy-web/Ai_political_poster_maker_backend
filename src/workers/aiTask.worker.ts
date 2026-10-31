import { prisma } from "../lib/prisma.js";
import { AiTaskStatus, AiTaskType } from "@prisma/client";
import { aiService } from "../modules/ai/ai.service.js";
import { IGenerateSlogansInput } from "../modules/ai/ai.interface.js";
import { sanitizeLogData } from "../modules/ai/ai.utils.js";
import cloudinary from "../config/cloudinary.js";
import { BillingService } from "../modules/payment/billing.service.js";

/**
 * Classifies whether an execution error is transient/retryable (rate limits, 5xx, network drops, timeouts)
 * or non-retryable (400 client error, invalid prompt, missing/invalid image URL, safety block).
 */
export function isRetryableError(error: any): boolean {
  if (!error) return false;

  const message = String(error.message || error).toLowerCase();
  const status = Number(error.status || error.statusCode || error.http_code);

  // 1. Explicit transient status codes (429 Too Many Requests, 408 Timeout, 5xx Server Errors) are retryable
  if (status === 429 || status === 408 || (status >= 500 && status < 600)) {
    return true;
  }

  // 2. Explicit transient message patterns are retryable
  const retryablePatterns = [
    "rate limit",
    "429",
    "500",
    "502",
    "503",
    "504",
    "timeout",
    "aborterror",
    "econnreset",
    "etimedout",
    "econnrefused",
    "socket hang up",
    "service unavailable",
    "temporarily unavailable",
    "overloaded",
  ];

  if (retryablePatterns.some((pattern) => message.includes(pattern))) {
    return true;
  }

  // 3. Client errors (4xx) are deterministic and non-retryable
  if (status >= 400 && status < 500) {
    return false;
  }

  // 4. Common non-retryable domain error patterns
  const nonRetryablePatterns = [
    "missing imageurl",
    "invalid image",
    "unsupported",
    "validation",
    "bad request",
    "unauthorized",
    "forbidden",
    "safety policy",
    "blocked prompt",
    "content violation",
    "not found",
    "background removal failed",
    "no face",
    "invalid url",
  ];

  if (nonRetryablePatterns.some((pattern) => message.includes(pattern))) {
    return false;
  }

  return false;
}

/**
 * Refunds user credit units if a billable AI task fails definitively.
 * Integrates directly with Hridoy's BillingService to guarantee immutable ledger consistency.
 */
async function refundAiTaskCreditsIfCharged(task: {
  id: string;
  userId: string | null;
  unitsCharged: number;
}): Promise<void> {
  if (!task.userId || task.unitsCharged <= 0) return;

  try {
    await BillingService.refundCredits(
      task.userId,
      task.unitsCharged,
      `ai-refund-${task.id}`
    );

    console.log(
      `[AiWorker] Refunded ${task.unitsCharged} credit(s) via BillingService to user ${task.userId} for task ${task.id}`
    );
  } catch (refundErr) {
    console.error(`[AiWorker] BillingService.refundCredits failed for task ${task.id}:`, refundErr);
  }
}

/**
 * Worker handler for processing individual AiTask records asynchronously.
 */
export async function processAiTaskJob(taskId: string): Promise<boolean> {
  console.log(`[AiWorker] Processing task ID: ${taskId}...`);

  const task = await prisma.aiTask.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    console.warn(`[AiWorker] Task ${taskId} not found. Skipping.`);
    return false;
  }

  // Ensure task is in actionable state
  if (task.status !== AiTaskStatus.PROCESSING && task.status !== AiTaskStatus.PENDING) {
    console.log(`[AiWorker] Task ${taskId} in terminal status '${task.status}'. No action needed.`);
    return true;
  }

  try {
    if (task.type === AiTaskType.CAPTION_SUGGESTION) {
      const input = (task.input as unknown as IGenerateSlogansInput) || { topic: "Political Campaign" };

      // Directly execute on the existing task record to avoid duplicate task generation
      await aiService.executeTaskSloganGeneration(taskId, input);

      console.log(`[AiWorker] Successfully completed Slogan AiTask: ${taskId}`);
      return true;
    }

    if (task.type === AiTaskType.BACKGROUND_REMOVAL) {
      const input = (task.input as any) || {};
      const imageUrl = input.imageUrl;

      if (!imageUrl) {
        throw new Error("Missing imageUrl for BACKGROUND_REMOVAL task");
      }

      console.log(`[AiWorker] Executing Background Removal for image:`, sanitizeLogData(imageUrl));

      let outputAssetUrl: string;
      let width: number | undefined;
      let height: number | undefined;
      let format: string | undefined;

      try {
        // Execute Cloudinary AI Background Removal
        const uploadRes = await cloudinary.uploader.upload(imageUrl, {
          folder: "political_bg_removed",
          transformation: [
            { effect: "background_removal" },
            { format: input.outputFormat || "png" },
          ],
        });
        outputAssetUrl = uploadRes.secure_url;
        width = uploadRes.width;
        height = uploadRes.height;
        format = uploadRes.format;
      } catch (clErr: any) {
        console.error(
          `[AiWorker] Cloudinary AI background removal failed for ${sanitizeLogData(imageUrl)}:`,
          clErr?.message || clErr
        );
        const err = new Error(
          `Background removal failed: ${clErr?.message || "AI cutout service could not remove the background"}`
        );
        (err as any).status = clErr?.http_code || clErr?.status;
        throw err;
      }

      await prisma.aiTask.update({
        where: { id: taskId },
        data: {
          status: AiTaskStatus.SUCCEEDED,
          result: {
            success: true,
            outputUrl: outputAssetUrl,
            width,
            height,
            format,
            message: "Background removal completed successfully",
            processedAt: new Date().toISOString(),
          },
          completedAt: new Date(),
        },
      });

      console.log(`[AiWorker] Successfully completed Background Removal AiTask: ${taskId}`);
      return true;
    }

    if (task.type === AiTaskType.IMAGE_RESHAPE) {
      const input = (task.input as any) || {};
      const imageUrl = input.imageUrl;

      if (!imageUrl) {
        throw new Error("Missing imageUrl for IMAGE_RESHAPE task");
      }

      console.log(`[AiWorker] Executing IMAGE_RESHAPE for task ID: ${taskId}`);

      const width = input.width ? parseInt(String(input.width), 10) : undefined;
      const height = input.height ? parseInt(String(input.height), 10) : undefined;
      const crop = input.crop || "fill";
      const gravity = input.gravity || "auto";

      const transformation: Record<string, any> = {
        crop,
        gravity,
      };
      if (width) transformation.width = width;
      if (height) transformation.height = height;
      if (input.aspectRatio) transformation.aspect_ratio = input.aspectRatio;
      if (input.format) transformation.format = input.format;

      const reshapeResult = await cloudinary.uploader.upload(imageUrl, {
        folder: "political_reshaped",
        transformation: [transformation],
      });

      await prisma.aiTask.update({
        where: { id: taskId },
        data: {
          status: AiTaskStatus.SUCCEEDED,
          result: {
            success: true,
            type: task.type,
            outputUrl: reshapeResult.secure_url,
            width: reshapeResult.width,
            height: reshapeResult.height,
            format: reshapeResult.format,
            bytes: reshapeResult.bytes,
            processedAt: new Date().toISOString(),
          },
          completedAt: new Date(),
        },
      });

      console.log(`[AiWorker] Successfully completed Image Reshape AiTask: ${taskId}`);
      return true;
    }

    if (task.type === AiTaskType.BACKGROUND_GENERATION) {
      const input = (task.input as any) || {};
      console.log(`[AiWorker] Executing BACKGROUND_GENERATION for task ID: ${taskId}`);

      let outputUrl = input.imageUrl || null;
      if (input.imageUrl) {
        const uploadRes = await cloudinary.uploader.upload(input.imageUrl, {
          folder: "political_backgrounds",
        });
        outputUrl = uploadRes.secure_url;
      }

      await prisma.aiTask.update({
        where: { id: taskId },
        data: {
          status: AiTaskStatus.SUCCEEDED,
          result: {
            success: true,
            type: task.type,
            outputUrl,
            processedAt: new Date().toISOString(),
          },
          completedAt: new Date(),
        },
      });

      console.log(`[AiWorker] Successfully completed Background Generation AiTask: ${taskId}`);
      return true;
    }

    console.warn(`[AiWorker] Unsupported AiTaskType: ${task.type} for task ${taskId}`);
    return false;
  } catch (error: any) {
    console.error(`[AiWorker] Failed processing task ${taskId}:`, sanitizeLogData(error?.message || error));

    const current = await prisma.aiTask.findUnique({
      where: { id: taskId },
      select: { retryCount: true, maxRetries: true, userId: true, unitsCharged: true },
    });

    const retryable = isRetryableError(error);
    const nextRetryCount = (current?.retryCount ?? 0) + 1;
    const maxRetries = current?.maxRetries ?? 3;

    if (retryable && nextRetryCount < maxRetries) {
      await prisma.aiTask.update({
        where: { id: taskId },
        data: {
          status: AiTaskStatus.PENDING,
          retryCount: nextRetryCount,
          errorCode: (error?.message || "JOB_RETRYABLE_ERROR").slice(0, 100),
        },
      }).catch((dbErr) => {
        console.error(`[AiWorker] Failed to update retry status for task ${taskId}:`, dbErr);
      });
      console.log(`[AiWorker] Task ${taskId} scheduled for retry (${nextRetryCount}/${maxRetries})`);
    } else {
      const finalErrorCode = !retryable
        ? `NON_RETRYABLE: ${(error?.message || "CLIENT_ERROR").slice(0, 80)}`
        : `MAX_RETRIES_EXCEEDED: ${(error?.message || "SERVICE_ERROR").slice(0, 75)}`;

      await prisma.aiTask.update({
        where: { id: taskId },
        data: {
          status: AiTaskStatus.FAILED,
          retryCount: nextRetryCount,
          errorCode: finalErrorCode.slice(0, 100),
          completedAt: new Date(),
        },
      }).catch((dbErr) => {
        console.error(`[AiWorker] Failed to update FAILED status for task ${taskId}:`, dbErr);
      });

      // Automatically refund unitsCharged if task was billable and permanently failed
      if (current) {
        await refundAiTaskCreditsIfCharged({
          id: taskId,
          userId: current.userId,
          unitsCharged: current.unitsCharged,
        });
      }

      console.error(
        `[AiWorker] Task ${taskId} terminated as FAILED (${!retryable ? "Non-retryable" : "Exceeded retries"}).`
      );
    }

    return false;
  }
}

/**
 * Concurrency-safe background worker queue polling engine.
 * Employs optimistic state transitions to prevent duplicate job claims across multi-worker environments.
 */
export function startAiTaskWorkerQueue(pollIntervalMs: number = 10000): NodeJS.Timeout {
  console.log(`[AiWorker] Background worker queue initialized (polling every ${pollIntervalMs}ms).`);

  const timer = setInterval(async () => {
    try {
      // Find oldest pending candidate
      const candidate = await prisma.aiTask.findFirst({
        where: {
          status: AiTaskStatus.PENDING,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      if (!candidate) return;

      // Atomic transition from PENDING -> PROCESSING
      const claim = await prisma.aiTask.updateMany({
        where: {
          id: candidate.id,
          status: AiTaskStatus.PENDING,
        },
        data: {
          status: AiTaskStatus.PROCESSING,
        },
      });

      // Execute only if successfully claimed by this worker instance
      if (claim.count > 0) {
        console.log(`[AiWorker] Claimed job ${candidate.id}. Starting processing...`);
        await processAiTaskJob(candidate.id);
      }
    } catch (err) {
      console.error("[AiWorker] Error in background worker loop:", sanitizeLogData(err));
    }
  }, pollIntervalMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return timer;
}
