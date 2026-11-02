import Groq from "groq-sdk";
import { IGenerateSlogansInput, ISloganItem, IAiTextProvider } from "../ai.interface.js";
import { buildSloganPrompt, parseSlogansJson } from "../prompt.builder.js";
import { ApiError } from "../../../utils/ApiError.js";

export class GroqProvider implements IAiTextProvider {
  public readonly name = "groq" as const;
  public readonly defaultModel: string;
  private client: Groq | null = null;
  private readonly fallbackModels = ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b"];

  constructor() {
    const rawKey = process.env.GROQ_API_KEY || "";
    const apiKey = rawKey.trim().replace(/^["']|["']$/g, "");
    if (apiKey) {
      this.client = new Groq({ apiKey });
    }
    this.defaultModel = (process.env.GROQ_MODEL || "qwen/qwen3.8-27b").trim().replace(/^["']|["']$/g, "");
  }

  public isConfigured(): boolean {
    return Boolean(this.client);
  }

  public async generateSlogans(input: IGenerateSlogansInput): Promise<{
    slogans: ISloganItem[];
    model: string;
  }> {
    if (!this.client) {
      throw new ApiError(503, "Groq API key is not configured in backend environment variables");
    }

    const count = input.count ?? 4;
    const prompt = buildSloganPrompt(input);

    const modelsToTry = [
      this.defaultModel,
      ...this.fallbackModels.filter((m) => m !== this.defaultModel),
    ];
    let lastError: any = null;

    for (const model of modelsToTry) {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, 10000); // 10s timeout

      try {
        const response = await this.client.chat.completions.create(
          {
            model,
            messages: [
              {
                role: "system",
                content:
                  "You are an expert political branding strategist and Bengali lyricist in Bangladesh. Output ONLY valid JSON containing a 'slogans' array. Each element must contain 'slogan' (2-line Bengali rhyming couplet), 'subText', 'category', and 'tone'. No extra commentary or markdown formatting outside JSON.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
            response_format: { type: "json_object" },
            temperature: 0.7,
          },
          { signal: abortController.signal }
        );
        clearTimeout(timeoutId);

        const content = response.choices[0]?.message?.content?.trim() ?? "{}";
        const slogans = parseSlogansJson(content);

        if (slogans.length > 0) {
          return {
            slogans: slogans.slice(0, count),
            model,
          };
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err;
        console.error(
          `[GroqProvider] Error with model ${model}:`,
          err?.status || err?.name,
          err?.message
        );
        if (err?.status === 401) {
          throw new ApiError(
            502,
            "Groq authentication failed: Invalid or expired GROQ_API_KEY"
          );
        }
      }
    }

    const status = lastError?.status === 429 ? 503 : 502;
    const message =
      lastError?.name === "AbortError"
        ? "Groq request timed out after 10s"
        : lastError?.message || "Upstream Groq API failed to generate slogans";

    throw new ApiError(status, `Groq Slogan Generation Failed: ${message}`);
  }
}
