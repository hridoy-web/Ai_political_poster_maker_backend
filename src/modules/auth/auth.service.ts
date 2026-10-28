import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

import { prisma } from "../../config/db.js";
import { ApiError } from "../../utils/ApiError.js";
import { withPrismaErrorHandling } from "../../utils/withPrismaErrorHandling.js";
import { claimGuestSessionForUser } from "../guest/guest.service.js";

export const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

// Cookie তৈরি ও clear—দুই ক্ষেত্রেই একই options ব্যবহার হবে।
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite:
    process.env.NODE_ENV === "production"
      ? ("none" as const)
      : ("lax" as const),
  path: "/",
};

const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;

  // Secret অনুপস্থিত বা 32 bytes-এর কম হলে token তৈরি করা হবে না।
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("JWT_SECRET must contain at least 32 bytes");
  }

  return secret;
};

const getSaltRounds = (): number => {
  const configuredRounds = process.env.SALT_ROUNDS;
  const rounds = configuredRounds ? Number(configuredRounds) : 12;

  if (!Number.isInteger(rounds) || rounds < 10 || rounds > 14) {
    throw new Error("SALT_ROUNDS must be an integer between 10 and 14");
  }

  return rounds;
};

const validatePasswordBytes = (password: string): void => {
  // bcrypt-এর 72-byte limit-এর বেশি password গ্রহণ করি না।
  if (Buffer.byteLength(password, "utf8") > 72) {
    throw new ApiError(400, "Password must not exceed 72 bytes");
  }
};

export const hashPassword = (password: string): Promise<string> =>
  bcrypt.hash(password, getSaltRounds());

const verifyPassword = (
  password: string,
  passwordHash: string,
): Promise<boolean> => bcrypt.compare(password, passwordHash);

export const generateToken = (userId: string): string =>
  jwt.sign({ id: userId }, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: "7d",
  });

export type RegisterAvatarInput = {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
};

export const registerUser = async (
  name: string,
  email: string,
  password: string,
  avatar?: RegisterAvatarInput,
) => {
  const normalizedName = name.trim();
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedName) {
    throw new ApiError(400, "Name is required");
  }

  if (password.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters");
  }

  validatePasswordBytes(password);

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (existingUser) {
    throw new ApiError(409, "User already exists with this email");
  }

  const passwordHash = await hashPassword(password);

  // UPDATED: user, Asset ও avatar relation একই transaction-এ লেখা হয়।
  // Duplicate email হলে shared helper সেটিকে 409 error-এ বদলায়।
  return withPrismaErrorHandling(
    () =>
      prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: normalizedName,
            email: normalizedEmail,
            password: passwordHash,
          },
          select: {
            id: true,
            name: true,
            email: true,
          },
        });

        const defaultRole = await tx.role.findUnique({
          where: { name: "USER" },
          select: { id: true },
        });

        if (!defaultRole) {
          throw new Error("USER role is not seeded");
        }

        await tx.userRole.create({
          data: {
            userId: user.id,
            roleId: defaultRole.id,
          },
        });
        if (avatar) {
          const asset = await tx.asset.create({
            data: {
              ownerUserId: user.id,
              purpose: "USER_UPLOAD",
              storageKey: avatar.storageKey,
              mimeType: avatar.mimeType,
              sizeBytes: avatar.sizeBytes,
            },
            select: {
              id: true,
            },
          });

          await tx.user.update({
            where: { id: user.id },
            data: {
              avatarAssetId: asset.id,
            },
          });
        }

        return user;
      }),
    {
      email: "User already exists with this email",
    },
  );
};

export const loginUser = async (
  email: string,
  password: string,
  guestToken?: unknown,
) => {
  const normalizedEmail = normalizeEmail(email);

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      name: true,
      email: true,
      password: true,
      status: true,
      roles: {
        select: {
          role: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!user || Buffer.byteLength(password, "utf8") > 72) {
    throw new ApiError(401, "Invalid email or password");
  }

  const isPasswordValid = await verifyPassword(password, user.password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid email or password");
  }

  if (user.status !== "ACTIVE") {
    throw new ApiError(403, "This account is not active");
  }

  // Login যাচাই সফল হওয়ার পরেই guest-এর data user account-এ claim করি।
  await claimGuestSessionForUser(guestToken, user.id);

  const token = generateToken(user.id);
  const roleNames = user.roles?.map((r) => r.role?.name).filter(Boolean) || [];

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      roles: roleNames,
      roleNames,
    },
    token,
  };
};