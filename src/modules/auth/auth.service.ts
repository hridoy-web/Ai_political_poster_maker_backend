import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

import { prisma } from "../../config/db.js";
import { ApiError } from "../../utils/ApiError.js";
import { withPrismaErrorHandling } from "../../utils/withPrismaErrorHandling.js";
import { claimGuestSessionForUser } from "../guest/guest.service.js";

export const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

// Cookie তৈরি ও clear—দুই ক্ষেত্রেই একই options ব্যবহার হবে।
const cleanEnv = (val?: string) => val?.trim().replace(/^[\"\']|[\"\']$/g, "");
const nodeEnv = cleanEnv(process.env.NODE_ENV);
const frontendUrl = cleanEnv(process.env.FRONTEND_URL);

// Local development check: if NODE_ENV is not production or frontend is running on localhost (HTTP)
const isLocal =
  nodeEnv !== "production" ||
  !frontendUrl ||
  frontendUrl.includes("localhost") ||
  frontendUrl.includes("127.0.0.1");

export const isProduction = !isLocal;

// Cookie তৈরি ও clear—দুই ক্ষেত্রেই একই options ব্যবহার হবে।
export const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? ("none" as const) : ("lax" as const),
  path: "/",
};

export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

export const NO_PASSWORD_MARKER = "!GOOGLE_AUTH_NO_PASSWORD";

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

  // user, Asset ও avatar relation একই transaction-এ লেখা হয়।