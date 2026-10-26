import { prisma } from "../lib/prisma.js";
import { AiTaskStatus, CreditEntryType } from "@prisma/client";

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
 * Helper to refund credits for billable AI tasks that definitively timed out or failed.
 */
async function refundTaskCredits(task: { id: string; userId: string | null; unitsCharged: number }, reason: string): Promise<void> {
  if (!task.userId || task.unitsCharged <= 0) return;

  try {
    await prisma.$transaction(async (tx) => {
      const wallet = await tx.creditWallet.findUnique({
        where: { userId: task.userId! },
      });
      if (wallet) {
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
            idempotencyKey: `ai-cron-${reason}-${task.id}`,
          },
        });
        console.log(`[Maintenance CronJob] Refunded ${task.unitsCharged} credits to user ${task.userId} (${reason})`);
      }
    });
  } catch (err) {
    console.error(`[Maintenance CronJob] Failed refund for task ${task.id}:`, err);
  }
}

/**
 * Scans for AI tasks remaining in PENDING past the cutoff threshold (default: 30m).
 * Safely marks them FAILED to avoid infinite loading in user dashboards and refunds if billable.
 */
export async function cleanupTimedOutAiTasks(timeoutMinutes: number = 30): Promise<number> {
  const cutoffTime = new Date(Date.now() - timeoutMinutes * 60 * 1000);

  const pendingTimedOut = await prisma.aiTask.findMany({
    where: {
      status: AiTaskStatus.PENDING,
      createdAt: { lt: cutoffTime },
    },
    select: {
      id: true,
      userId: true,
      unitsCharged: true,
    },
  });

  let timedOutCount = 0;

  for (const task of pendingTimedOut) {
    const claim = await prisma.aiTask.updateMany({
      where: {
        id: task.id,
        status: AiTaskStatus.PENDING, // Atomic check
      },
      data: {
        status: AiTaskStatus.FAILED,
        errorCode: "AI_TASK_TIMED_OUT",
        completedAt: new Date(),
      },
    });

    if (claim.count > 0) {
      timedOutCount++;
      await refundTaskCredits(task, "timeout");
    }
  }

  return timedOutCount;
}

/**
 * Detects tasks stuck in PROCESSING due to worker crashes or sudden pod terminations.
 * If retries remain: resets to PENDING so another worker can retry.
 * If maxRetries exceeded: marks as FAILED permanently and refunds if billable.
 * Uses atomic CAS (compare-and-swap) to avoid race conditions with concurrently finishing workers.
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
      userId: true,
      unitsCharged: true,
      retryCount: true,
      maxRetries: true,
    },
  });

  let recoveredCount = 0;
  let failedCount = 0;

  for (const task of stuckTasks) {
    const nextRetry = task.retryCount + 1;
    const isExceeded = nextRetry >= task.maxRetries;

    // Atomic state update: ensures we only touch the task if it is STILL in PROCESSING state
    const claim = await prisma.aiTask.updateMany({
      where: {
        id: task.id,
        status: AiTaskStatus.PROCESSING,
      },
      data: {
        status: isExceeded ? AiTaskStatus.FAILED : AiTaskStatus.PENDING,
        retryCount: nextRetry,
        errorCode: isExceeded ? "MAX_RETRIES_EXCEEDED_AFTER_CRASH" : "RECOVERED_FROM_WORKER_CRASH",
        completedAt: isExceeded ? new Date() : null,
      },
    });

    // Only update metrics and refund if this cron run actually performed the transition
    if (claim.count > 0) {
      if (isExceeded) {
        failedCount++;
        await refundTaskCredits(task, "crash-exceeded");
      } else {
        recoveredCount++;
      }
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
