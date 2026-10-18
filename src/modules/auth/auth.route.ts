import { Router } from "express";
import { login, logout, register } from "./auth.controller.js";
import { upload } from "../../middlewares/multer.middleware.js";
import { verifyToken } from "../../middlewares/auth.middleware.js";

const authRoutes = Router();

authRoutes.post("/register", upload.single("image"), register);
authRoutes.post("/login", login);
authRoutes.post("/logout", verifyToken, logout);

export default authRoutes;
