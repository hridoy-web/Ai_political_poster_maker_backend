import { CorsOptions } from "cors";

const cleanUrl = (url?: string) => url?.trim().replace(/^["']|["']$/g, "").replace(/\/$/, "");

const frontendUrl = cleanUrl(process.env.FRONTEND_URL) || "http://localhost:3000";
const clientUrl = cleanUrl(process.env.CLIENT_URL) || "http://localhost:3000";

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "https://ai-political-poster-frontend.vercel.app",
  "https://ai-political-poster-maker-backend-u3lr.onrender.com",
  "https://sandbox.sslcommerz.com",
  "https://securepay.sslcommerz.com",
  frontendUrl,
  clientUrl,
].filter(Boolean) as string[];

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || origin === "null") {
      return callback(null, true);
    }

    const normalizedOrigin = origin.replace(/\/$/, "");

    if (
      allowedOrigins.includes(normalizedOrigin) ||
      normalizedOrigin.endsWith(".vercel.app") ||
      normalizedOrigin.includes("sslcommerz.com") ||
      normalizedOrigin.startsWith("http://localhost:") ||
      normalizedOrigin.startsWith("http://127.0.0.1:")
    ) {
      return callback(null, true);
    }

    console.warn(`[CORS] Blocked request from origin: ${origin}`);
    return callback(null, false);
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
