import { z } from "zod";

export const generateSlogansSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(2, "Topic must be at least 2 characters")
    .max(200, "Topic must be at most 200 characters"),
  candidateName: z.string().trim().max(100).optional(),
  designation: z.string().trim().max(100).optional(),
  area: z.string().trim().max(100).optional(), // constituency or address
  partyOrIdeology: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  keywords: z.array(z.string().trim().max(50)).max(10).optional(),
  count: z.number().int().min(1).max(10).default(4), // ডিফল্ট ৪টি আইটেম
  language: z.enum(["bn", "en"]).default("bn"),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export const getTaskStatusParamsSchema = z.object({
  id: z.string().uuid("Invalid task ID format"),
});

export const createAiTaskSchema = z.object({
  type: z.enum([
    "CAPTION_SUGGESTION",
    "BACKGROUND_GENERATION",
    "BACKGROUND_REMOVAL",
    "IMAGE_RESHAPE",
  ]),
  input: z.record(z.string(), z.any()),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export const removeBackgroundSchema = z.object({
  imageUrl: z.string().url("Valid image URL is required"),
  outputFormat: z.enum(["png", "webp"]).default("png"),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});
