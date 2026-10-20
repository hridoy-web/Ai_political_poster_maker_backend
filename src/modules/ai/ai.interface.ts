import { AiTaskType, AiTaskStatus } from "@prisma/client";

/**
 * Clean, simplified political slogan item for posters.
 */
export interface ISloganItem {
  slogan: string;   // খাঁটি দুই চরণের ছন্দময় স্লোগান (যেমন: "মিরপুরের বুকে ইনসাফের আলো, / সাদ ভাই মানুষ ভালো।")
  subText?: string; // পোস্টারের নিচের ছোট সহায়ক বাক্য (যেমন: "আসন্ন নির্বাচনে আপনার মূল্যবান ভোট ও দোয়া প্রার্থী।")
}

/**
 * Standard input payload for AI slogan generation
 */
export interface IGenerateSlogansInput {
  topic: string;
  candidateName?: string;
  designation?: string;
  area?: string; // Constituency / Area / Address (যেমন: "ঢাকা-১০", "মিরপুর")
  partyOrIdeology?: string; // Political Party or Movement (যেমন: বিএনপি, জামায়াত, এনসিপি)
  category?: string; // Poster category
  keywords?: string[];
  count?: number; // ডিফল্ট ৪টি আইটেম
  language?: "bn" | "en";
  idempotencyKey?: string;
}

/**
 * Output data returned upon successful slogan generation
 */
export interface ISloganGenerationResult {
  taskId: string;
  provider: "gemini" | "groq";
  model: string;
  slogans: ISloganItem[];
  unitsCharged: number;
}

/**
 * Provider contract that all LLM integrations must satisfy
 */
export interface IAiTextProvider {
  name: "gemini" | "groq";
  defaultModel: string;
  generateSlogans(input: IGenerateSlogansInput): Promise<{
    slogans: ISloganItem[];
    model: string;
  }>;
}

