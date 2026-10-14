import type { AskOpts } from "./claude";
import { GROQ_MODEL } from "./config";

/**
 * Free fallback for when there's no Anthropic key: Groq's OpenAI-compatible chat API
 * (free plan, no card). Asks for a JSON object and checks the top-level keys the
 * schema requires; anything else returns null so the caller uses its scripted fallback.
 */
export async function askGroqJSON<T>(opts: AskOpts): Promise<T | null> {
  const required = (opts.schema.required as string[] | undefined) ?? [];
  const messages = [
    {
      role: "system",
      content: `${opts.system}\n\nAnswer with one JSON object only, no other text. It must match this JSON schema:\n${JSON.stringify(opts.schema)}`,
    },
    ...opts.messages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : m.content.map((b) => ("text" in b ? b.text : "")).join("\n"),
    })),
  ];
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages, response_format: { type: "json_object" }, max_tokens: opts.maxTokens ?? 4000 }),
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) {
      console.error(`Groq error ${r.status}:`, (await r.text()).slice(0, 300));
      return null;
    }
    const data = await r.json();
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    if (!text) return null;
    const out = JSON.parse(text);
    if (!out || typeof out !== "object" || required.some((k) => !(k in out))) return null;
    return out as T;
  } catch (e) {
    console.error("Groq call failed:", e);
    return null;
  }
}
