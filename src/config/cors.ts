import { CorsOptions } from "cors";

const cleanUrl = (url?: string) => url?.trim().replace(/^["']|["']$/g, "");

const frontendUrl = cleanUrl(process.env.FRONTEND_URL) || "http://localhost:3000";
const clientUrl = cleanUrl(process.env.CLIENT_URL) || "http://localhost:3000";

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "https://sandbox.sslcommerz.com",
  "https://securepay.sslcommerz.com",
  frontendUrl,
  clientUrl,
].filter(Boolean) as string[];

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (
      !origin ||
      origin === "null" ||
      allowedOrigins.includes(origin) ||
      origin.includes("sslcommerz.com") ||
      origin.startsWith("http://localhost:") ||
      origin.startsWith("http://127.0.0.1:")
    ) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Cookie",
    "X-Requested-With",
    "Accept",
  ],
  exposedHeaders: ["Set-Cookie"],
};
