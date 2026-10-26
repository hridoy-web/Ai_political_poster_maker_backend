import Groq from "groq-sdk";
import { IGenerateSlogansInput, ISloganItem, IAiTextProvider } from "../ai.interface.js";
import { buildSloganPrompt, parseSlogansJson } from "../prompt.builder.js";

export class GroqProvider implements IAiTextProvider {
  public readonly name = "groq" as const;
  public readonly defaultModel = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
  private client: Groq | null = null;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (apiKey) {
      this.client = new Groq({ apiKey });
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
      throw new Error("Groq API key is not configured");
    }

    const count = input.count ?? 4;
    const prompt = buildSloganPrompt(input);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Groq request timed out after 8s")), 8000)
    );

    const completionPromise = this.client.chat.completions.create({
      model: this.defaultModel,
      messages: [
        {
          role: "system",
          content:
            "You are an expert political branding strategist in Bangladesh. Return ONLY valid JSON with a 'slogans' array containing headline, subText, category, tone in Bengali.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const response = await Promise.race([completionPromise, timeoutPromise]);
    const content = response.choices[0]?.message?.content?.trim() ?? "{}";
    const slogans = parseSlogansJson(content);

    if (slogans.length === 0) {
      throw new Error("Groq returned empty or unparseable slogans JSON");
    }

    return {
      slogans: slogans.slice(0, count),
      model: this.defaultModel,
    };
  }
}
