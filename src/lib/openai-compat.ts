import type { AskOpts } from "./claude";

export interface Provider { name: string; url: string; key: string; model: string }

/**
 * Alternatives for when there's no Anthropic key: xAI (Grok) and Groq both speak the
 * OpenAI-style chat API. Asks for a JSON object and checks the top-level keys the
 * schema requires; anything else returns null so the caller uses its scripted fallback.
 */
export async function askCompatJSON<T>(p: Provider, opts: AskOpts): Promise<T | null> {
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
    const r = await fetch(p.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${p.key}` },
      body: JSON.stringify({ model: p.model, messages, response_format: { type: "json_object" }, max_tokens: opts.maxTokens ?? 4000 }),
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) {
      console.error(`${p.name} error ${r.status}:`, (await r.text()).slice(0, 300));
      return null;
    }
    const data = await r.json();
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    if (!text) return null;
    const out = JSON.parse(text);
    if (!out || typeof out !== "object" || required.some((k) => !(k in out))) return null;
    return out as T;
  } catch (e) {
    console.error(`${p.name} call failed:`, e);
    return null;
  }
}
