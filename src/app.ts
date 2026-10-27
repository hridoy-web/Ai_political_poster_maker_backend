import cors from "cors";
import express from "express";
import cookieParser  from 'cookie-parser'
import apiRoutes from "./routes/routes.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { notFoundMiddleware } from "./middlewares/notFound.middleware.js";
import { corsOptions } from "./config/cors.js";

const app = express();

app.use(cors(corsOptions))
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser())

app.get("/", (_req, res) => {
  res.json({ message: "AI Poster Maker API is running" });
});

// Normalize duplicate leading slashes from external gateway callbacks (e.g. //api/v1 -> /api/v1)
app.use((req, _res, next) => {
  if (req.url.startsWith("//")) {
    req.url = req.url.replace(/^\/+/, "/");
  }
  next();
});

app.use("/api/v1", apiRoutes);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;