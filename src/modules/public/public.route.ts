import { Router } from "express";
import { getPublicStats, trackVisit } from "./public.controller.js";

const publicRouter = Router();

publicRouter.get("/stats", getPublicStats);
publicRouter.post("/track-visit", trackVisit);

export default publicRouter;
