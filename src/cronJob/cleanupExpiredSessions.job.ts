import { prisma } from "../lib/prisma.js";
import { AiTaskStatus } from "@prisma/client";

/**
 * Interface representing the summary result of a maintenance cleanup execution.
 */
export interface ICleanupMaintenanceResult {
  success: boolean;
  timedOutTasksCount: number;
  expiredSessionsCount: number;
  durationMs: number;
  executedAt: Date;
  error?: string;
}

/**
 * 1. Cleanup Timed-Out AI Tasks
 * 
 * Scans the database for AI tasks that have remained in 'PENDING' status for longer than
 * the specified timeout threshold (default: 30 minutes). Such tasks typically indicate
 * unhandled server restarts, network timeouts, or interrupted client connections.
 * 
 * Safely marks these tasks as 'FAILED' with errorCode 'AI_TASK_TIMED_OUT' so users
 * are not left waiting indefinitely and their dashboard state remains accurate.
 *
 * @param timeoutMinutes - Threshold in minutes after which a pending task is considered timed out.
 * @returns Number of affected tasks updated.
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
 * 2. Cleanup Expired Guest Sessions
 * 
 * Deletes guest sessions whose expiration timestamp ('expiresAt') has passed and were
 * never claimed or linked to a registered user account ('userId' is null and 'claimedAt' is null).
 * 
 * In accordance with the Prisma schema:
 * - Temporary upload assets associated with the session are automatically cascaded.
 * - Historical poster/AI records safely have their guestSessionId set to null.
 *
 * @returns Number of expired guest sessions removed.
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
 * 3. Run All Scheduled Cleanups (Main Runner)
 * 
 * Executes both timed-out AI task mitigation and expired guest session pruning.
 * Measures execution duration and provides structured logging.
 *
 * @param aiTimeoutMinutes - Cutoff threshold for pending AI tasks.
 * @returns ICleanupMaintenanceResult containing summary metrics.
 */
export async function runScheduledCleanup(
  aiTimeoutMinutes: number = 30
): Promise<ICleanupMaintenanceResult> {
  const startTime = Date.now();
  const executedAt = new Date();

  console.log(`[Maintenance CronJob] Started at ${executedAt.toISOString()}`);

  try {
    const timedOutTasksCount = await cleanupTimedOutAiTasks(aiTimeoutMinutes);
    const expiredSessionsCount = await cleanupExpiredGuestSessions();
    const durationMs = Date.now() - startTime;

    console.log(
      `[Maintenance CronJob] Finished in ${durationMs}ms: ` +
        `[AiTasks timed-out: ${timedOutTasksCount}] | ` +
        `[GuestSessions purged: ${expiredSessionsCount}]`
    );

    return {
      success: true,
      timedOutTasksCount,
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
      expiredSessionsCount: 0,
      durationMs,
      executedAt,
      error: errorMessage,
    };
  }
}

/**
 * 4. Background Cron Job Scheduler
 * 
 * Starts an in-memory recurring interval timer to run maintenance cleanups at a regular cadence.
 * Uses timer.unref() so background execution does not block clean Node.js process shutdowns.
 *
 * @param intervalMinutes - Recurrence interval in minutes (default: 30 minutes).
 * @param aiTimeoutMinutes - Inactivity cutoff for pending AI tasks (default: 30 minutes).
 * @returns NodeJS.Timeout handle for the scheduler.
 */
export function startCleanupCronJob(
  intervalMinutes: number = 30,
  aiTimeoutMinutes: number = 30
): NodeJS.Timeout {
  console.log(
    `[Maintenance CronJob] Scheduler initialized to run every ${intervalMinutes} minute(s).`
  );

  const intervalMs = intervalMinutes * 60 * 1000;

  const timer = setInterval(() => {
    runScheduledCleanup(aiTimeoutMinutes).catch((err) => {
      console.error("[Maintenance CronJob] Uncaught error in scheduled execution cycle:", err);
    });
  }, intervalMs);

  // Unref ensures process shutdown is not blocked if the server receives SIGINT/SIGTERM
  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return timer;
}
