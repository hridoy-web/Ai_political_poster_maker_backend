import { Router } from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { getCurrentUser, updateProfile, deleteCurrentUser } from "./user.controller.js";
import { upload } from "../../middlewares/multer.middleware.js";

const userRoutes = Router();

userRoutes.get("/me", verifyToken, getCurrentUser);
userRoutes.delete("/me", verifyToken, deleteCurrentUser);
userRoutes.post("/update-profile", verifyToken, upload.single("image"), updateProfile);
userRoutes.patch("/profile", verifyToken, upload.single("image"), updateProfile);

export default userRoutes;
