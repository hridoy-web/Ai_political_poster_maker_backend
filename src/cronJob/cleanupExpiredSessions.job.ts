import { prisma } from "../lib/prisma.js";
import { AiTaskStatus } from "@prisma/client";

/**
 * Summary metrics of maintenance cleanup execution.
 */
export interface ICleanupMaintenanceResult {
  success: boolean;
  timedOutTasksCount: number;
  recoveredProcessingTasksCount: number;
  failedStuckTasksCount: number;
  expiredSessionsCount: number;
  durationMs: number;
  executedAt: Date;
  error?: string;
}

/**
 * Scans for AI tasks remaining in PENDING past the cutoff threshold (default: 30m).
 * Safely marks them FAILED to avoid infinite loading in user dashboards.
 */
export async function cleanupTimedOutAiTasks(timeoutMinutes: number = 30): Promise<number> {
  const cutoffTime = new Date(Date.now() - timeoutMinutes * 60 * 1000);

  const result = await prisma.aiTask.updateMany({
    where: {
      status: AiTaskStatus.PENDING,
      createdAt: {
        lt: cutoffTime,
      },
    },
    data: {
      status: AiTaskStatus.FAILED,
      errorCode: "AI_TASK_TIMED_OUT",
      completedAt: new Date(),
    },
  });

  return result.count;
}

/**
 * Detects tasks stuck in PROCESSING due to worker crashes or sudden pod terminations.
 * If retries remain: resets to PENDING so another worker can retry.
 * If maxRetries exceeded: marks as FAILED permanently.
 */
export async function recoverStuckProcessingAiTasks(
  stuckThresholdMinutes: number = 15
): Promise<{ recoveredCount: number; failedCount: number }> {
  const cutoffTime = new Date(Date.now() - stuckThresholdMinutes * 60 * 1000);

  const stuckTasks = await prisma.aiTask.findMany({
    where: {
      status: AiTaskStatus.PROCESSING,
      createdAt: { lt: cutoffTime },
    },
    select: {
      id: true,
      retryCount: true,
      maxRetries: true,
    },
  });

  let recoveredCount = 0;
  let failedCount = 0;

  for (const task of stuckTasks) {
    const nextRetry = task.retryCount + 1;
    if (nextRetry < task.maxRetries) {
      await prisma.aiTask.update({
        where: { id: task.id },
        data: {
          status: AiTaskStatus.PENDING,
          retryCount: nextRetry,
          errorCode: "RECOVERED_FROM_WORKER_CRASH",
        },
      });
      recoveredCount++;
    } else {
      await prisma.aiTask.update({
        where: { id: task.id },
        data: {
          status: AiTaskStatus.FAILED,
          retryCount: nextRetry,
          errorCode: "MAX_RETRIES_EXCEEDED_AFTER_CRASH",
          completedAt: new Date(),
        },
      });
      failedCount++;
    }
  }

  return { recoveredCount, failedCount };
}

/**
 * Deletes unlinked guest sessions that passed their expiration timestamp.
 */
export async function cleanupExpiredGuestSessions(): Promise<number> {
  const result = await prisma.guestSession.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
      userId: null,
      claimedAt: null,
    },
  });

  return result.count;
}

/**
 * Main maintenance cleanup cycle runner.
 */
export async function runScheduledCleanup(
  aiTimeoutMinutes: number = 30,
  stuckThresholdMinutes: number = 15
): Promise<ICleanupMaintenanceResult> {
  const startTime = Date.now();
  const executedAt = new Date();

  console.log(`[Maintenance CronJob] Started at ${executedAt.toISOString()}`);

  try {
    const timedOutTasksCount = await cleanupTimedOutAiTasks(aiTimeoutMinutes);
    const { recoveredCount, failedCount } = await recoverStuckProcessingAiTasks(stuckThresholdMinutes);
    const expiredSessionsCount = await cleanupExpiredGuestSessions();
    const durationMs = Date.now() - startTime;

    console.log(
      `[Maintenance CronJob] Finished in ${durationMs}ms: ` +
        `[AiTasks timed-out: ${timedOutTasksCount}] | ` +
        `[Stuck tasks recovered: ${recoveredCount}, failed: ${failedCount}] | ` +
        `[GuestSessions purged: ${expiredSessionsCount}]`
    );

    return {
      success: true,
      timedOutTasksCount,
      recoveredProcessingTasksCount: recoveredCount,
      failedStuckTasksCount: failedCount,
      expiredSessionsCount,
      durationMs,
      executedAt,
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error?.message || "Unknown error during maintenance cleanup";

    console.error(`[Maintenance CronJob] Failed after ${durationMs}ms:`, error);

    return {
      success: false,
      timedOutTasksCount: 0,
      recoveredProcessingTasksCount: 0,
      failedStuckTasksCount: 0,
      expiredSessionsCount: 0,
      durationMs,
      executedAt,
      error: errorMessage,
    };
  }
}

/**
 * In-memory recurring cron scheduler for maintenance operations.
 */
export function startCleanupCronJob(
  intervalMinutes: number = 30,
  aiTimeoutMinutes: number = 30,
  stuckThresholdMinutes: number = 15
): NodeJS.Timeout {
  console.log(
    `[Maintenance CronJob] Scheduler initialized to run every ${intervalMinutes} minute(s).`
  );

  const intervalMs = intervalMinutes * 60 * 1000;

  const timer = setInterval(() => {
    runScheduledCleanup(aiTimeoutMinutes, stuckThresholdMinutes).catch((err) => {
      console.error("[Maintenance CronJob] Uncaught error in scheduled execution cycle:", err);
    });
  }, intervalMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return timer;
}
