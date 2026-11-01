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

export const isProduction =
  nodeEnv === "production" ||
  Boolean(process.env.RENDER) ||
  Boolean(process.env.VERCEL) ||
  (typeof frontendUrl === "string" && frontendUrl.length > 0 && !frontendUrl.includes("localhost") && !frontendUrl.includes("127.0.0.1"));

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

        let defaultRole = await tx.role.findUnique({
          where: { name: "USER" },
          select: { id: true },
        });

        if (!defaultRole) {
          defaultRole = await tx.role.create({
            data: {
              name: "USER",
              description: "Standard user access",
              isSystem: true,
            },
            select: { id: true },
          });
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
              permissions: {
                select: {
                  permission: {
                    select: { key: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (
    !user ||
    user.password === NO_PASSWORD_MARKER ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
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
  const permissionKeys =
    user.roles
      ?.flatMap((r) => r.role?.permissions?.map((p) => p.permission?.key))
      .filter(Boolean) || [];

  const hasCreditBypass =
    roleNames.includes("SUPER_ADMIN") ||
    roleNames.includes("ADMIN") ||
    permissionKeys.includes("UNLIMITED_CREDITS") ||
    permissionKeys.includes("BYPASS_CREDIT_CHECK") ||
    permissionKeys.includes("POSTER_CREATE_FREE") ||
    permissionKeys.includes("POSTER:CREATE:FREE") ||
    permissionKeys.includes("CREDITS:BYPASS");

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      roles: roleNames,
      roleNames,
      permissions: permissionKeys,
      hasCreditBypass,
    },
    token,
  };
};

export const googleLoginService = async (
  idToken: string,
  guestToken?: unknown
) => {
  if (!idToken || typeof idToken !== "string") {
    throw new ApiError(400, "Google ID token is required");
  }

  const cleanToken = idToken.trim();
  const HARDCODED_GOOGLE_CLIENT_ID =
    "1092641471377-7a1uo4i2jc9n8ljigmb90s19vuojv0ja.apps.googleusercontent.com";
  const rawClientId = process.env.GOOGLE_CLIENT_ID || HARDCODED_GOOGLE_CLIENT_ID;
  const clientId = rawClientId.trim().replace(/^["']|["']$/g, "") || HARDCODED_GOOGLE_CLIENT_ID;
  const allowedAudiences = Array.from(
    new Set([clientId, HARDCODED_GOOGLE_CLIENT_ID].filter(Boolean))
  );


  console.log("[Google Auth] Incoming token (first 25 chars):", cleanToken.slice(0, 25) + "...");
  console.log("[Google Auth] Incoming token length:", cleanToken.length);
  console.log("[Google Auth] Configured GOOGLE_CLIENT_ID:", clientId ? `${clientId.slice(0, 15)}...` : "NOT_SET");

  let payload: any;

  const isJwt = cleanToken.split(".").length === 3;

  // 1. If it's a signed JWT, verify with OAuth2Client
  if (isJwt) {
    try {
      console.log("[Google Auth] Token appears to be JWT ID Token. Verifying with OAuth2Client...");
      const client = new OAuth2Client(clientId || undefined);
      const ticket = await client.verifyIdToken({
        idToken: cleanToken,
        audience: allowedAudiences,
      });
      payload = ticket.getPayload();
      console.log("[Google Auth] OAuth2Client.verifyIdToken succeeded. Email:", payload?.email);
    } catch (jwtErr: any) {
      console.error("[Google Auth Error Details - verifyIdToken with audience]:", jwtErr?.message || jwtErr);

      // Try verifying without audience constraint if audience failed
      try {
        const client = new OAuth2Client();
        const ticket = await client.verifyIdToken({ idToken: cleanToken });
        payload = ticket.getPayload();
        console.log("[Google Auth] verifyIdToken without audience succeeded. Email:", payload?.email);
      } catch (relaxedJwtErr: any) {
        console.error("[Google Auth Error Details - relaxed verifyIdToken]:", relaxedJwtErr?.message || relaxedJwtErr);
      }
    }
  } else {
    console.log("[Google Auth] Token is not a JWT (likely OAuth2 access token). Proceeding to Google API verification.");
  }

  // 2. If no payload yet (e.g. OAuth2 access token or unverified JWT), try Google's userinfo endpoint (v3)
  if (!payload?.email) {
    try {
      console.log("[Google Auth] Querying https://www.googleapis.com/oauth2/v3/userinfo...");
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${cleanToken}` },
      });

      if (userInfoRes.ok) {
        const data = (await userInfoRes.json()) as any;
        console.log("[Google Auth] v3 userinfo successful. Email:", data?.email);
        payload = {
          email: data.email,
          email_verified: data.email_verified,
          name: data.name,
          picture: data.picture,
        };
      } else {
        const errText = await userInfoRes.text();
        console.warn(`[Google Auth] v3 userinfo failed (${userInfoRes.status}):`, errText);
      }
    } catch (fetchErr: any) {
      console.warn("[Google Auth] Error fetching v3 userinfo:", fetchErr?.message || fetchErr);
    }
  }

  // 3. If still no payload, try Google's tokeninfo endpoint
  if (!payload?.email) {
    try {
      console.log("[Google Auth] Querying https://oauth2.googleapis.com/tokeninfo...");
      const tokenInfoRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?${isJwt ? "id_token" : "access_token"}=${encodeURIComponent(cleanToken)}`
      );

      if (tokenInfoRes.ok) {
        const tokenData = (await tokenInfoRes.json()) as any;
        console.log("[Google Auth] tokeninfo successful. Email:", tokenData?.email);
        payload = {
          email: tokenData.email,
          email_verified: tokenData.email_verified,
          name: tokenData.email?.split("@")[0] || "User",
          picture: tokenData.picture || null,
        };
      } else {
        const errText = await tokenInfoRes.text();
        console.warn(`[Google Auth] tokeninfo failed (${tokenInfoRes.status}):`, errText);
      }
    } catch (tokenInfoErr: any) {
      console.warn("[Google Auth] Error fetching tokeninfo:", tokenInfoErr?.message || tokenInfoErr);
    }
  }

  // 4. If still no payload, try Google's userinfo endpoint (v2)
  if (!payload?.email) {
    try {
      console.log("[Google Auth] Querying https://www.googleapis.com/oauth2/v2/userinfo...");
      const v2Res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${cleanToken}` },
      });

      if (v2Res.ok) {
        const v2Data = (await v2Res.json()) as any;
        console.log("[Google Auth] v2 userinfo successful. Email:", v2Data?.email);
        payload = {
          email: v2Data.email,
          email_verified: v2Data.verified_email ?? v2Data.email_verified,
          name: v2Data.name,
          picture: v2Data.picture,
        };
      } else {
        const errText = await v2Res.text();
        console.warn(`[Google Auth] v2 userinfo failed (${v2Res.status}):`, errText);
      }
    } catch (v2Err: any) {
      console.warn("[Google Auth] Error fetching v2 userinfo:", v2Err?.message || v2Err);
    }
  }

  if (!payload || !payload.email) {
    console.error("[Google Auth] All token verification methods failed for incoming token.");
    throw new ApiError(401, "Invalid Google login token");
  }

  const isEmailVerified =
    payload.email_verified === true ||
    payload.email_verified === "true" ||
    payload.verified_email === true ||
    payload.verified_email === "true" ||
    typeof payload.email_verified === "undefined";

  if (!isEmailVerified) {
    console.error("[Google Auth] Email not verified according to Google payload:", payload);
    throw new ApiError(401, "Google email not verified or unavailable");
  }

  const normalizedEmail = normalizeEmail(payload.email);
  const name = ((payload.name as string) || "").trim() || normalizedEmail.split("@")[0] || "User";
  const picture = (payload.picture as string) || null;

  let user: any = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      avatar: { select: { storageKey: true } },
      roles: {
        select: {
          role: {
            select: {
              name: true,
              permissions: {
                select: {
                  permission: {
                    select: { key: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    // Create new user and assign default USER role
    const defaultPasswordHash = await hashPassword(Math.random().toString(36).slice(-10) + "Aa1@!");

    user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name,
          email: normalizedEmail,
          password: defaultPasswordHash,
        },
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          avatar: { select: { storageKey: true } },
        },
      });

      let defaultRole = await tx.role.findUnique({
        where: { name: "USER" },
        select: { id: true },
      });

      if (!defaultRole) {
        defaultRole = await tx.role.create({
          data: {
            name: "USER",
            description: "Standard user access",
            isSystem: true,
          },
          select: { id: true },
        });
      }

      if (defaultRole) {
        await tx.userRole.create({
          data: {
            userId: newUser.id,
            roleId: defaultRole.id,
          },
        });
      }

      return {
        ...newUser,
        roles: defaultRole ? [{ role: { name: "USER" } }] : [],
      };
    });
  } else {
    if (user.status !== "ACTIVE") {
      throw new ApiError(403, "This account is not active");
    }
  }

  if (!user) {
    throw new ApiError(500, "User account unavailable");
  }

  // Claim guest session if applicable
  await claimGuestSessionForUser(guestToken, user.id);

  const token = generateToken(user.id);
  const roleNames = user.roles?.map((r: any) => r.role?.name).filter(Boolean) || ["USER"];
  const permissionKeys =
    user.roles
      ?.flatMap((r: any) => r.role?.permissions?.map((p: any) => p.permission?.key))
      .filter(Boolean) || [];

  const hasCreditBypass =
    roleNames.includes("SUPER_ADMIN") ||
    roleNames.includes("ADMIN") ||
    permissionKeys.includes("UNLIMITED_CREDITS") ||
    permissionKeys.includes("BYPASS_CREDIT_CHECK") ||
    permissionKeys.includes("POSTER_CREATE_FREE") ||
    permissionKeys.includes("POSTER:CREATE:FREE") ||
    permissionKeys.includes("CREDITS:BYPASS");

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      roles: roleNames,
      roleNames,
      permissions: permissionKeys,
      hasCreditBypass,
    },
    token,
  };
};
