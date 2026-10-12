/// <reference types="node" />
import { loadEnvFile } from "node:process";
import { defineConfig, env } from "prisma/config";

loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});