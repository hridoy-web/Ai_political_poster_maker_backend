import { Router } from "express";
import { getPublicStats } from "./public.controller.js";

const publicRouter = Router();

publicRouter.get("/stats", getPublicStats);

export default publicRouter;
