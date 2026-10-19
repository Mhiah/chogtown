import Anthropic from "@anthropic-ai/sdk";
import { MODEL, hasClaude, altProviders } from "./config";
import { askCompatJSON } from "./openai-compat";

let client: Anthropic | null = null;
const ai = () => (client ??= new Anthropic());

type Effort = "low" | "medium" | "high";

export interface AskOpts {
  system: string;
  messages: Anthropic.MessageParam[];
  schema: Record<string, unknown>;
  effort?: Effort;
  maxTokens?: number;
}

/**
 * One AI call that must come back as JSON matching `schema`.
 * Uses Claude (structured outputs) when ANTHROPIC_API_KEY is set, else xAI Grok or
 * Groq, whichever key is set and answers first (see altProviders). Returns null when neither is set, the model
 * declines, or the call fails, so every caller has a scripted fallback and the town never breaks.
 */
export async function askJSON<T>(opts: AskOpts): Promise<T | null> {
  if (hasClaude()) {
    const out = await askClaude<T>(opts);
    if (out) return out;
  }
  // Grok, then Groq: a provider that is out of credits or down just hands over to the next one.
  for (const p of altProviders()) {
    const out = await askCompatJSON<T>(p, opts);
    if (out) return out;
  }
  return null;
}

async function askClaude<T>(opts: AskOpts): Promise<T | null> {
  try {
    const res = await ai().messages.create({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 4000,
      system: opts.system,
      messages: opts.messages,
      output_config: { effort: opts.effort ?? "low", format: { type: "json_schema", schema: opts.schema } },
    });
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    return text ? (JSON.parse(text) as T) : null;
  } catch (e) {
    if (e instanceof Anthropic.APIError) console.error(`Claude API error ${e.status}:`, e.message);
    else console.error("Claude call failed:", e);
    return null;
  }
}

/** JSON schema helpers. Structured outputs need every object closed and every property required. */
export const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
export const str = (description?: string) => ({ type: "string", ...(description ? { description } : {}) });
export const int = (description?: string) => ({ type: "integer", ...(description ? { description } : {}) });
export const bool = (description?: string) => ({ type: "boolean", ...(description ? { description } : {}) });
export const oneOf = (values: string[], description?: string) => ({ type: "string", enum: values, ...(description ? { description } : {}) });
export const arr = (items: unknown, description?: string) => ({ type: "array", items, ...(description ? { description } : {}) });
