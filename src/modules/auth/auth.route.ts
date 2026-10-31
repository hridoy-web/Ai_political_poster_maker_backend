import { Router } from "express";
import { login, logout, register } from "./auth.controller.js";
import { upload } from "../../middlewares/multer.middleware.js";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { rateLimit } from "../../middlewares/rateLimit.middleware.js";
import { googleLogin } from "./googleLogin.controller.js";

const authRoutes = Router();

// Strict rate limit for authentication endpoints to mitigate credential stuffing and brute-force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per IP
  message: "Too many authentication attempts. Please try again after 15 minutes.",
});

authRoutes.post("/register", authLimiter, upload.single("image"), register);
authRoutes.post("/login", authLimiter, login);
authRoutes.post("/google", authLimiter, googleLogin);
authRoutes.post("/logout", verifyToken, logout);

export default authRoutes;
