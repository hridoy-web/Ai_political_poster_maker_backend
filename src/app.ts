import cors from "cors";
import express from "express";
// import apiRoutes from "./routes/index.routes";
const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "AI Poster Maker API is running" });
});
// app.use("/api/v1", apiRoutes);
export default app;
