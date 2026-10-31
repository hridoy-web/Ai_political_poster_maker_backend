import { createHash, randomBytes } from "node:crypto";

import { prisma } from "../../config/db.js";
import { ApiError } from "../../utils/ApiError.js";

const GUEST_SESSION_DAYS = 7;

export const createGuestSession = async () => {
  // আন্দাজ করা কঠিন token তৈরি করি; database-এ শুধু token-এর hash রাখি।
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const expiresAt = new Date(
    Date.now() + GUEST_SESSION_DAYS * 24 * 60 * 60 * 1000,
  );

  try {
    const session = await prisma.guestSession.create({
      data: {
        tokenHash,
        expiresAt,
      },
      select: {
        id: true,
        expiresAt: true,
      },
    });

    // আসল token একবার controller-কে দিই, যাতে সেটি cookie-তে রাখতে পারে।
    return {
      guestSessionId: session.id,
      guestToken: token,
      expiresAt: session.expiresAt,
    };
  } catch {
    throw new ApiError(500, "Could not create guest session");
  }
};

export const verifyGuestSessionToken = async (
  token: unknown,
): Promise<string> => {
  if (typeof token !== "string" || token.length < 32 || token.length > 128) {
    throw new ApiError(401, "Invalid guest session");
  }

  // Cookie-র token hash করে database-এ রাখা hash-এর সঙ্গে মেলাই।
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const session = await prisma.guestSession.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      expiresAt: true,
      userId: true,
      claimedAt: true,
    },
  });

  // মেয়াদ শেষ বা user account-এ claim হওয়া session guest হিসেবে চলবে না।
  if (
    !session ||
    session.expiresAt <= new Date() ||
    session.userId !== null ||
    session.claimedAt !== null
  ) {
    throw new ApiError(401, "Guest session is invalid or expired");
  }

  return session.id;
};
export const claimGuestSessionForUser = async (
  token: unknown,
  userId: string,
): Promise<boolean> => {
  if (typeof token !== "string" || token.length < 32 || token.length > 128) {
    return false;
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    // শুধু মেয়াদ থাকা এবং আগে claim না হওয়া session claim করা যাবে।
    const claim = await tx.guestSession.updateMany({
      where: {
        tokenHash,
        expiresAt: { gt: now },
        userId: null,
        claimedAt: null,
      },
      data: {
        userId,
        claimedAt: now,
      },
    });

    // Token ভুল, session মেয়াদোত্তীর্ণ, বা অন্য request আগেই claim করেছে।
    if (claim.count !== 1) {
      return false;
    }

    const session = await tx.guestSession.findUnique({
      where: { tokenHash },
      select: { id: true },
    });

    if (!session) {
      return false;
    }

    // Guest-এর assets user-এর মালিকানায় দিই।
    await tx.asset.updateMany({
      where: {
        guestSessionId: session.id,
        ownerUserId: null,
      },
      data: {
        ownerUserId: userId,
        guestSessionId: null,
      },
    });

    // Guest-এর posters user-এর মালিকানায় দিই।
    await tx.poster.updateMany({
      where: {
        guestSessionId: session.id,
        userId: null,
      },
      data: {
        userId,
        guestSessionId: null,
      },
    });

    // Guest-এর AI tasks user-এর মালিকানায় দিই।
    await tx.aiTask.updateMany({
      where: {
        guestSessionId: session.id,
        userId: null,
      },
      data: {
        userId,
        guestSessionId: null,
      },
    });

    return true;
  });
};