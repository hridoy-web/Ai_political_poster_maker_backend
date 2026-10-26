import type { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma.js";

export const verifyAssetOwner = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const rawId = req.params.id;

        // Express-এর string | string[] থেকে সেফলি string এ কনভার্ট করা
        const assetId = typeof rawId === "string" ? rawId : rawId?.[0];

        if (!assetId) {
            res.status(400).json({ success: false, message: "Asset ID is required in route parameters." });
            return;
        }

        const authenticatedUserId = (req as any).user?.id;

        if (!authenticatedUserId) {
            res.status(401).json({ success: false, message: "Unauthorized: No user session found." });
            return;
        }

        const asset = await prisma.asset.findUnique({
            where: { id: assetId },
            select: { ownerUserId: true },
        });

        if (!asset) {
            res.status(404).json({ success: false, message: "Asset not found." });
            return;
        }

        // IDOR / BOLA Check: কারেন্ট ইউজার এই অ্যাসেটের মালিক কি না যাচাই করা
        if (asset.ownerUserId !== authenticatedUserId) {
            res.status(403).json({
                success: false,
                message: "Forbidden: You do not have permission to access or modify this asset.",
            });
            return;
        }

        next();
    } catch (error: any) {
        console.error("OWNERSHIP GUARD ERROR:", error);
        res.status(500).json({ success: false, message: "Internal server error during authorization." });
    }
};