import { Router } from "express";
import { createGuest } from "./guest.controller.js";

const guestRoutes = Router();

guestRoutes.post("/session", createGuest);

export default guestRoutes;