import { prisma } from "../lib/prisma.js";
import { AiTaskStatus } from "@prisma/client";

/**
 * Interface representing the summary result of a maintenance cleanup execution.
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
 * 1. Cleanup Timed-Out AI Tasks
 * 
 * Scans the database for AI tasks that have remained in 'PENDING' status for longer than
 * the specified timeout threshold (default: 30 minutes).
 * Safely marks these tasks as 'FAILED' with errorCode 'AI_TASK_TIMED_OUT'.
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
 * 2. Recover Stuck 'PROCESSING' AI Tasks (Worker Crash Recovery)
 * 
 * Detects tasks that have been in 'PROCESSING' for longer than the cutoff (default: 15 minutes)
 * caused by sudden worker terminations, pod restarts, or network disruptions.
 * 
 * If retryCount < maxRetries: resets to 'PENDING' so another worker picks it up.
 * If retryCount >= maxRetries: marks as 'FAILED' with 'MAX_RETRIES_EXCEEDED'.
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
 * 3. Cleanup Expired Guest Sessions
 * 
 * Deletes guest sessions whose expiration timestamp ('expiresAt') has passed and were
 * never claimed or linked to a registered user account ('userId' is null and 'claimedAt' is null).
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
 * 4. Run All Scheduled Cleanups (Main Runner)
 * 
 * Executes timed-out task mitigation, stuck job crash recovery, and expired guest session pruning.
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
 * 5. Background Cron Job Scheduler
 * 
 * Starts an in-memory recurring interval timer to run maintenance cleanups at a regular cadence.
 * Uses timer.unref() so background execution does not block clean Node.js process shutdowns.
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
