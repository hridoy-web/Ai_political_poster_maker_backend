import { AiTaskType } from "@prisma/client";

/**
 * Clean rhyming couplet and auxiliary promotional text for poster generation.
 */
export interface ISloganItem {
  slogan: string;
  subText?: string;
}

/**
 * Input parameters for campaign slogan generation.
 */
export interface IGenerateSlogansInput {
  topic: string;
  candidateName?: string;
  designation?: string;
  area?: string;
  partyOrIdeology?: string;
  category?: string;
  keywords?: string[];
  count?: number;
  language?: "bn" | "en";
  idempotencyKey?: string;
}

/**
 * Result payload returned from slogan generation service.
 */
export interface ISloganGenerationResult {
  taskId: string;
  provider: "gemini" | "groq";
  model: string;
  slogans: ISloganItem[];
  unitsCharged: number;
}

/**
 * Text LLM provider contract interface.
 */
export interface IAiTextProvider {
  readonly name: "gemini" | "groq";
  readonly defaultModel: string;
  isConfigured(): boolean;
  generateSlogans(input: IGenerateSlogansInput): Promise<{
    slogans: ISloganItem[];
    model: string;
  }>;
}

/**
 * Authenticated user or guest caller context.
 */
export interface IAuthContext {
  userId?: string;
  guestSessionId?: string;
  role?: string;
}

/**
 * Payload for enqueuing asynchronous background AI tasks.
 */
export interface ICreateAiTaskInput {
  type: AiTaskType;
  input: Record<string, any>;
  idempotencyKey?: string;
}

/**
 * Payload for enqueuing async background removal tasks.
 */
export interface IRemoveBackgroundInput {
  imageUrl: string;
  outputFormat?: "png" | "webp";
  idempotencyKey?: string;
}
