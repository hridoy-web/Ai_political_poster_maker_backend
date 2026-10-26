import app from "./app.js";
import connectDB from "./config/db.js";
import { startAiTaskWorkerQueue } from "./workers/aiTask.worker.js";
import { startCleanupCronJob } from "./cronJob/cleanupExpiredSessions.job.js";

const port = Number(process.env.PORT ?? 5000);

async function startServer(): Promise<void> {
  try {
    await connectDB();

    // Start background asynchronous AI worker queue and maintenance cron jobs
    const workerTimer = startAiTaskWorkerQueue(5000);
    const cleanupTimer = startCleanupCronJob(15, 30, 15);

    const server = app.listen(port, () => {
      console.log(`Server is running at http://localhost:${port}`);
    });

    const gracefulShutdown = (signal: string) => {
      console.log(`[Server] Received ${signal}. Shutting down gracefully...`);
      if (workerTimer) clearInterval(workerTimer);
      if (cleanupTimer) clearInterval(cleanupTimer);
      server.close(() => {
        console.log("[Server] Closed out remaining connections.");
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
   
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
}

void startServer();
