import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/ApiError.js";

interface RateLimitOptions {
  windowMs?: number; // Time window in milliseconds (default: 15 minutes)
  max?: number;      // Max allowed requests per IP within the window (default: 100)
  message?: string;  // Error message on limit exceeded
}

interface ClientRecord {
  count: number;
  resetTime: number;
}

const ipRequestMap = new Map<string, ClientRecord>();

// Periodic cleanup of stale entries to prevent memory bloat
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipRequestMap.entries()) {
    if (now > record.resetTime) {
      ipRequestMap.delete(ip);
    }
  }
}, 10 * 60 * 1000);

if (typeof cleanupInterval.unref === "function") {
  cleanupInterval.unref();
}

/**
 * In-memory IP-based rate limiter middleware for sensitive endpoints (e.g. auth, payments, AI generation).
 *
 * TODO [Production Scaling]: In a multi-replica/cluster deployment behind a load balancer,
 * replace this in-memory Map with a centralized Redis-backed store (e.g., redis-rate-limiter / BullMQ).
 */
export const rateLimit = (options: RateLimitOptions = {}) => {
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const max = options.max ?? 100;
  const message = options.message ?? "Too many requests. Please try again later.";

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIp = (req.ip || req.socket.remoteAddress || "unknown-ip").toString();
    const now = Date.now();

    const record = ipRequestMap.get(clientIp);

    if (!record || now > record.resetTime) {
      ipRequestMap.set(clientIp, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    record.count += 1;

    if (record.count > max) {
      res.setHeader("Retry-After", Math.ceil((record.resetTime - now) / 1000));
      return next(new ApiError(429, message));
    }

    return next();
  };
};

export default rateLimit;

