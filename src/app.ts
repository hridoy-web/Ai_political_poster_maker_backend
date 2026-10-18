import cors from "cors";
import express from "express";
import cookieParser  from 'cookie-parser'
import apiRoutes from "./routes/routes.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { notFoundMiddleware } from "./middlewares/notFound.middleware.js";

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser())

app.get("/", (_req, res) => {
  res.json({ message: "AI Poster Maker API is running" });
});

app.use("/api/v1", apiRoutes);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;