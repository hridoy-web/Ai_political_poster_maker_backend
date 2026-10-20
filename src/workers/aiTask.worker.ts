import { prisma } from "../lib/prisma.js";
import { AiTaskStatus, AiTaskType } from "@prisma/client";
import { aiService } from "../modules/ai/ai.service.js";
import { IGenerateSlogansInput } from "../modules/ai/ai.interface.js";

/**
 * Worker handler for processing an individual AiTask job asynchronously.
 * Can be invoked by BullMQ, an event emitter, or a job queue dispatcher.
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

  if (task.status !== AiTaskStatus.PENDING) {
    console.log(`[AiWorker] Task ${taskId} already in status '${task.status}'. No action needed.`);
    return true;
  }

  try {
    if (task.type === AiTaskType.CAPTION_SUGGESTION) {
      const input = (task.input as unknown as IGenerateSlogansInput) || { topic: "Political Campaign" };

      await aiService.generateSlogans(input, {
        userId: task.userId ?? undefined,
        guestSessionId: task.guestSessionId ?? undefined,
      });

      console.log(`[AiWorker] Successfully completed AiTask: ${taskId}`);
      return true;
    }

    console.warn(`[AiWorker] Unsupported AiTaskType: ${task.type} for task ${taskId}`);
    return false;
  } catch (error: any) {
    console.error(`[AiWorker] Failed processing task ${taskId}:`, error);

    await prisma.aiTask.update({
      where: { id: taskId },
      data: {
        status: AiTaskStatus.FAILED,
        errorCode: (error?.message || "WORKER_PROCESSING_FAILED").slice(0, 100),
        completedAt: new Date(),
      },
    }).catch((dbErr) => {
      console.error(`[AiWorker] Failed to update error status for task ${taskId}:`, dbErr);
    });

    return false;
  }
}

/**
 * Lightweight background queue poller for processing queued AI jobs
 * without forcing Redis dependency in local development.
 */
export function startAiTaskWorkerQueue(pollIntervalMs: number = 10000): NodeJS.Timeout {
  console.log(`[AiWorker] Background worker queue initialized (polling every ${pollIntervalMs}ms).`);

  const timer = setInterval(async () => {
    try {
      // Find oldest pending task that hasn't timed out yet
      const pendingTask = await prisma.aiTask.findFirst({
        where: {
          status: AiTaskStatus.PENDING,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      if (pendingTask) {
        await processAiTaskJob(pendingTask.id);
      }
    } catch (err) {
      console.error("[AiWorker] Error in background worker loop:", err);
    }
  }, pollIntervalMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return timer;
}
