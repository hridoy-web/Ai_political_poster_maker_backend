import "dotenv/config";

const cleanEnv = (val?: string) => val?.trim().replace(/^["']|["']$/g, "") || "";

export const HARDCODED_GOOGLE_CLIENT_ID =
  "1092641471377-7a1uo4i2jc9n8ljigmb90s19vuojv0ja.apps.googleusercontent.com";

export const env = {
  PORT: process.env.PORT || "5000",
  NODE_ENV: process.env.NODE_ENV || "development",
  DATABASE_URL: process.env.DATABASE_URL || "",
  JWT_SECRET: process.env.JWT_SECRET || "",
  GOOGLE_CLIENT_ID: cleanEnv(process.env.GOOGLE_CLIENT_ID) || HARDCODED_GOOGLE_CLIENT_ID,
  FRONTEND_URL: cleanEnv(process.env.FRONTEND_URL) || "http://localhost:3000",
  CLIENT_URL: cleanEnv(process.env.CLIENT_URL) || "http://localhost:3000",
};

