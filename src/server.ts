import app from "./app.js";
import prisma from "./lib/prisma.js";
import { startPosterWorkerQueue } from "./workers/poster.worker.js";
import { startAiTaskWorkerQueue } from "./workers/aiTask.worker.js";
import { startCleanupCronJob } from "./cronJob/cleanupExpiredSessions.job.js";

const port = Number(process.env.PORT ?? 5000);

async function startServer(): Promise<void> {
  try {
    await prisma.$connect();
    console.log("PostgreSQL connected successfully.");

    // Start background asynchronous workers and maintenance cron jobs
    const aiWorkerTimer = startAiTaskWorkerQueue(5000);
    const posterWorkerTimer = startPosterWorkerQueue(5000);
    const cleanupTimer = startCleanupCronJob(15, 30, 15);

    const server = app.listen(port, () => {
      console.log(`Server is running at http://localhost:${port}`);
    });

    const gracefulShutdown = (signal: string) => {
      console.log(`[Server] Received ${signal}. Shutting down gracefully...`);
      if (aiWorkerTimer) clearInterval(aiWorkerTimer);
      if (posterWorkerTimer) clearInterval(posterWorkerTimer);
      if (cleanupTimer) clearInterval(cleanupTimer);

      server.close(async () => {
        console.log("[Server] Closed out remaining HTTP connections.");
        try {
          await prisma.$disconnect();
          console.log("[Server] Disconnected database pool cleanly.");
        } catch (dbErr) {
          console.error("[Server] Error disconnecting database pool:", dbErr);
        }
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    process.on("unhandledRejection", (reason: unknown) => {
      console.error("[Server] Critical: Unhandled Promise Rejection:", reason);
    });

    process.on("uncaughtException", (error: Error) => {
      console.error("[Server] Critical: Uncaught Exception:", error);
    });
   
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
}

void startServer();
