import cors from "cors";
import express from "express";
import apiRoutes from "./routes/routes.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { notFoundMiddleware } from "./middlewares/notFound.middleware.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "AI Poster Maker API is running" });
});

app.use("/api/v1", apiRoutes);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;