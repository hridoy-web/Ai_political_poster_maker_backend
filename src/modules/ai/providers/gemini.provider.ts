import { GoogleGenAI } from "@google/genai";
import { IGenerateSlogansInput, ISloganItem, IAiTextProvider } from "../ai.interface.js";
import { buildSloganPrompt, parseSlogansJson } from "../prompt.builder.js";

export class GeminiProvider implements IAiTextProvider {
  public readonly name = "gemini" as const;
  public readonly defaultModel = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  private client: GoogleGenAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.client = new GoogleGenAI({ apiKey });
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.client);
  }

  public async generateSlogans(input: IGenerateSlogansInput): Promise<{
    slogans: ISloganItem[];
    model: string;
  }> {
    if (!this.client) {
      throw new Error("Gemini API key is not configured");
    }

    const count = input.count ?? 4;
    const prompt = buildSloganPrompt(input);

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 8000);

    try {
      const response = await this.client.models.generateContent({
        model: this.defaultModel,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.7,
          abortSignal: abortController.signal,
        },
      });
      clearTimeout(timeoutId);

      const text = response.text?.trim() ?? "{}";
      const slogans = parseSlogansJson(text);

      if (slogans.length === 0) {
        throw new Error("Gemini returned empty or unparseable slogans JSON");
      }

      return {
        slogans: slogans.slice(0, count),
        model: this.defaultModel,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (abortController.signal.aborted) {
        throw new Error("Gemini request timed out after 8s (aborted)");
      }
      throw err;
    }
  }
}
