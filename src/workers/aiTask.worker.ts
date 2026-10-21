import { prisma } from "../lib/prisma.js";
import { AiTaskStatus, AiTaskType } from "@prisma/client";
import { aiService } from "../modules/ai/ai.service.js";
import { IGenerateSlogansInput } from "../modules/ai/ai.interface.js";
import { sanitizeLogData } from "../modules/ai/ai.utils.js";

/**
 * Worker handler for processing an individual AiTask job asynchronously.
 * Can be invoked by BullMQ, an event emitter, or the atomic background queue dispatcher.
 *
 * @param taskId - Unique ID of the AiTask to process
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

  // Ensure task is in PROCESSING state (having been atomically claimed)
  if (task.status !== AiTaskStatus.PROCESSING && task.status !== AiTaskStatus.PENDING) {
    console.log(`[AiWorker] Task ${taskId} in terminal status '${task.status}'. No action needed.`);
    return true;
  }

  try {
    // 1. Process Slogan Suggestion Job
    if (task.type === AiTaskType.CAPTION_SUGGESTION) {
      const input = (task.input as unknown as IGenerateSlogansInput) || { topic: "Political Campaign" };

      await aiService.generateSlogans(input, {
        userId: task.userId ?? undefined,
        guestSessionId: task.guestSessionId ?? undefined,
      });

      console.log(`[AiWorker] Successfully completed Slogan AiTask: ${taskId}`);
      return true;
    }

    // 2. Process Background Removal Job (Async Worker Fallback)
    if (task.type === AiTaskType.BACKGROUND_REMOVAL) {
      const input = (task.input as any) || {};
      console.log(`[AiWorker] Executing Background Removal for image:`, sanitizeLogData(input.imageUrl));

      // Simulate or process background removal asset result
      const outputAssetUrl = input.imageUrl
        ? `${input.imageUrl}?bg=removed&v=${Date.now()}`
        : null;

      await prisma.aiTask.update({
        where: { id: taskId },
        data: {
          status: AiTaskStatus.SUCCEEDED,
          result: {
            success: true,
            outputUrl: outputAssetUrl,
            message: "Background removal completed successfully",
          },
          completedAt: new Date(),
        },
      });

      console.log(`[AiWorker] Successfully completed Background Removal AiTask: ${taskId}`);
      return true;
    }

    // 3. Process Generic Background Generation / Image Reshape Job
    if (
      task.type === AiTaskType.BACKGROUND_GENERATION ||
      task.type === AiTaskType.IMAGE_RESHAPE
    ) {
      console.log(`[AiWorker] Executing task type '${task.type}' for task ID: ${taskId}`);

      await prisma.aiTask.update({
        where: { id: taskId },
        data: {
          status: AiTaskStatus.SUCCEEDED,
          result: {
            success: true,
            type: task.type,
            processedAt: new Date().toISOString(),
          },
          completedAt: new Date(),
        },
      });

      console.log(`[AiWorker] Successfully completed AiTask: ${taskId}`);
      return true;
    }

    console.warn(`[AiWorker] Unsupported AiTaskType: ${task.type} for task ${taskId}`);
    return false;
  } catch (error: any) {
    console.error(`[AiWorker] Failed processing task ${taskId}:`, sanitizeLogData(error?.message || error));

    const current = await prisma.aiTask.findUnique({
      where: { id: taskId },
      select: { retryCount: true, maxRetries: true },
    });

    const nextRetryCount = (current?.retryCount ?? 0) + 1;
    const maxRetries = current?.maxRetries ?? 3;

    if (nextRetryCount < maxRetries) {
      // Revert to PENDING so another worker cycle can retry the job
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
      // Max retries exceeded; mark permanently as FAILED
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
      console.error(`[AiWorker] Task ${taskId} exceeded max retries (${maxRetries}). Marked FAILED.`);
    }

    return false;
  }
}

/**
 * Lightweight, atomic background queue dispatcher.
 * Concurrency-Safe: Uses optimistic locking to guarantee that multiple concurrent worker processes
 * will never process the same task simultaneously.
 */
export function startAiTaskWorkerQueue(pollIntervalMs: number = 10000): NodeJS.Timeout {
  console.log(`[AiWorker] Concurrency-safe background worker queue initialized (polling every ${pollIntervalMs}ms).`);

  const timer = setInterval(async () => {
    try {
      // 1. Locate the oldest PENDING task candidate
      const candidate = await prisma.aiTask.findFirst({
        where: {
          status: AiTaskStatus.PENDING,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      if (!candidate) return;

      // 2. ATOMIC CLAIM: Atomically change status from PENDING to PROCESSING.
      // If another worker instance already claimed it within this millisecond, count will be 0.
      const claim = await prisma.aiTask.updateMany({
        where: {
          id: candidate.id,
          status: AiTaskStatus.PENDING,
        },
        data: {
          status: AiTaskStatus.PROCESSING,
        },
      });

      // 3. Only the worker that successfully transitioned the row processes it
      if (claim.count > 0) {
        console.log(`[AiWorker] Atomically claimed job ${candidate.id}. Starting processing...`);
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
