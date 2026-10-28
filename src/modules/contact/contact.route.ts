import { Router } from "express";
import { handleContactMessage } from "./contact.controller.js";

const contactRouter = Router();

contactRouter.post("/", handleContactMessage);

export default contactRouter;
