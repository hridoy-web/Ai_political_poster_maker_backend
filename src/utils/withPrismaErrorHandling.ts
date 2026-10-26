import { ApiError } from "./ApiError.js";

type UniqueConflictMessages = Record<string, string>;

const getErrorCode = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
};

const getUniqueTarget = (error: unknown): string => {
  if (typeof error !== "object" || error === null || !("meta" in error)) {
    return "";
  }

  const meta = (error as { meta?: { target?: unknown } }).meta;
  const target = meta?.target;

  return Array.isArray(target)
    ? target.join(",").toLowerCase()
    : String(target ?? "").toLowerCase();
};

export const withPrismaErrorHandling = async <T>(
  operation: () => Promise<T>,
  uniqueConflictMessages: UniqueConflictMessages = {},
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    // পরিচিত unique constraint হলে নির্দিষ্ট API error দিই।
    if (getErrorCode(error) === "P2002") {
      const target = getUniqueTarget(error);

      const matchingConflict = Object.entries(uniqueConflictMessages).find(
        ([field]) => target.includes(field.toLowerCase()),
      );

      if (matchingConflict) {
        throw new ApiError(409, matchingConflict[1]);
      }
    }

    // অন্য database error-কে আসল error হিসেবেই global handler-এ পাঠাই।
    throw error;
  }
};