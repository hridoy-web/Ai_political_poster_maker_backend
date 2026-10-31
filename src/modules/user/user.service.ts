import { randomBytes } from "node:crypto";

import { prisma } from "../../lib/prisma.js";
import { hashPassword } from "../auth/auth.service.js";
import { ApiError } from "../../utils/ApiError.js";

export const anonymizeUserAccount = async (userId: string): Promise<void> => {
  // পুরোনো password hash-ও সরিয়ে আন্দাজ-অযোগ্য password hash রাখি।
  const replacementPassword = randomBytes(48).toString("hex");
  const passwordHash = await hashPassword(replacementPassword);
  const anonymizedEmail = `deleted+${userId}@anonymized.invalid`;

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    if (user.status === "DELETED") {
      return;
    }

    // ব্যক্তিগত profile তথ্য মুছি; financial ও historical record অক্ষত রাখি।
    await tx.user.update({
      where: { id: userId },
      data: {
        name: "Deleted User",
        email: anonymizedEmail,
        password: passwordHash,
        userProfile: null,
        title: null,
        area: null,
        avatarAssetId: null,
        status: "DELETED",
      },
    });

    // Account-এর permission ও ব্যক্তিগত bookmark মুছে দিই।
    await tx.userRole.deleteMany({ where: { userId } });
    await tx.bookmark.deleteMany({ where: { userId } });
  });
};