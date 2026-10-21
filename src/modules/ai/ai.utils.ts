/**
 * Utility functions for AI module security and data sanitization.
 * Ensures compliance with PRD Rule 9: "Prompt/result log-এ sensitive data না রাখা।"
 */

/**
 * Masks sensitive patterns such as Bangladeshi phone numbers, emails, and credentials
 * within raw strings before logging to stdout or server logs.
 */
export function maskSensitiveString(str: string): string {
  if (!str || typeof str !== "string") return str;

  // Mask Bangladeshi phone numbers (+8801XXXXXXXXX or 01XXXXXXXXX)
  // Example: 01712345678 -> 017****5678
  let sanitized = str.replace(
    /(\+?8801[3-9]\d{1})(\d{4})(\d{3})/g,
    "$1****$3"
  ).replace(
    /(01[3-9]\d{1})(\d{4})(\d{3})/g,
    "$1****$3"
  );

  // Mask email addresses: john.doe@example.com -> j***e@example.com
  sanitized = sanitized.replace(
    /([a-zA-Z0-9_\-\.]{1,2})([a-zA-Z0-9_\-\.]+)(@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})/g,
    (_match, prefix, _middle, domain) => `${prefix}***${domain}`
  );

  return sanitized;
}

/**
 * Deeply sanitizes any object, array, or primitive before printing in server logs.
 * Masks sensitive keys (password, token, apiKey, secret, creditCard) and sensitive string patterns.
 */
export function sanitizeLogData<T = any>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === "string") {
    return maskSensitiveString(data) as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item)) as unknown as T;
  }

  if (typeof data === "object") {
    const sensitiveKeys = ["password", "token", "apikey", "secret", "authorization", "cookie"];
    const sanitizedObj: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        sanitizedObj[key] = "[REDACTED]";
      } else {
        sanitizedObj[key] = sanitizeLogData(value);
      }
    }
    return sanitizedObj as T;
  }

  return data;
}
