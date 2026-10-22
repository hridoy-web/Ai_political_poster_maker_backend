/**
 * Data Sanitization & Privacy Protection Utility
 *
 * Enforces PRD Requirement #9: Masks PII (personally identifiable information like phone numbers,
 * emails, credentials) prior to emission in stdout, application logs, or error stack traces.
 */

/**
 * Masks sensitive patterns such as phone numbers, emails, and credentials
 * within raw strings before logging to stdout or server logs.
 */
export function maskSensitiveString(str: string): string {
  if (!str || typeof str !== "string") return str;

  // Mask Bangladeshi phone numbers (+8801XXXXXXXXX or 01XXXXXXXXX) -> e.g. 0171****5678
  let sanitized = str
    .replace(/(\+?8801[3-9]\d{1})(\d{4})(\d{3})/g, "$1****$3")
    .replace(/(01[3-9]\d{1})(\d{4})(\d{3})/g, "$1****$3");

  // Mask email addresses: john.doe@example.com -> j***e@example.com
  sanitized = sanitized.replace(
    /([a-zA-Z0-9_\-\.]{1,2})([a-zA-Z0-9_\-\.]+)(@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})/g,
    (_match, prefix, _middle, domain) => `${prefix}***${domain}`
  );

  return sanitized;
}

/**
 * Recursively redacts sensitive keys and patterns from objects, arrays, or primitive values.
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
