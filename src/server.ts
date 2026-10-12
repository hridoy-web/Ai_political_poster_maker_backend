import app from "./app.js";
import connectDB from "./config/db.js";

const port = Number(process.env.PORT ?? 5000);

async function startServer(): Promise<void> {
  try {
    await connectDB();

    app.listen(port, () => {
      console.log(`Server is running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
}

void startServer();