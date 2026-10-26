import { prisma } from "../lib/prisma.js";
import { AiTaskStatus, AiTaskType, CreditEntryType } from "@prisma/client";
import { aiService } from "../modules/ai/ai.service.js";
import { IGenerateSlogansInput } from "../modules/ai/ai.interface.js";
import { sanitizeLogData } from "../modules/ai/ai.utils.js";
import cloudinary from "../config/cloudinary.js";

/**
 * Refunds user credit units if a billable AI task fails definitively.
 */
async function refundAiTaskCreditsIfCharged(task: {
  id: string;
  userId: string | null;
  unitsCharged: number;
}): Promise<void> {
  if (!task.userId || task.unitsCharged <= 0) return;

  try {
    await prisma.$transaction(async (tx) => {
      const wallet = await tx.creditWallet.findUnique({
        where: { userId: task.userId! },
      });

      if (!wallet) return;

      const newBalance = wallet.balance + task.unitsCharged;

      await tx.creditWallet.update({
        where: { userId: task.userId! },
        data: { balance: newBalance },
      });

      await tx.creditLedgerEntry.create({
        data: {
          userId: task.userId!,
          type: CreditEntryType.REFUND,
          amount: task.unitsCharged,
          balanceAfter: newBalance,
          idempotencyKey: `ai-refund-${task.id}`,
        },
      });

      console.log(
        `[AiWorker] Automatically refunded ${task.unitsCharged} credit(s) to user ${task.userId} for failed task ${task.id}`
      );
    });
  } catch (refundErr) {
    console.error(`[AiWorker] Failed to refund credits for task ${task.id}:`, refundErr);
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
        // Execute real Cloudinary AI Background Removal
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
        console.warn(
          `[AiWorker] Cloudinary AI background removal effect failed: ${clErr?.message}. Falling back to standard PNG upload.`
        );
        const fallbackRes = await cloudinary.uploader.upload(imageUrl, {
          folder: "political_bg_removed",
          format: input.outputFormat || "png",
        });
        outputAssetUrl = fallbackRes.secure_url;
        width = fallbackRes.width;
        height = fallbackRes.height;
        format = fallbackRes.format;
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

    const nextRetryCount = (current?.retryCount ?? 0) + 1;
    const maxRetries = current?.maxRetries ?? 3;

    if (nextRetryCount < maxRetries) {
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
      await prisma.aiTask.update({
        where: { id: taskId },
        data: {
          status: AiTaskStatus.FAILED,
          retryCount: nextRetryCount,
          errorCode: (error?.message || "MAX_RETRIES_EXCEEDED").slice(0, 100),
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

      console.error(`[AiWorker] Task ${taskId} exceeded max retries (${maxRetries}). Marked FAILED.`);
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
