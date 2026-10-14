import { json } from "@/lib/api";
import { store } from "@/lib/store";
import { tokenURI } from "@/lib/chain";
import { fetchMeta, lastMetaError } from "@/lib/metadata";
import { lastAltError } from "@/lib/openai-compat";
import { askJSON, obj, str } from "@/lib/claude";
import { altProviders, hasClaude, MODEL } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const time = async <T,>(f: () => Promise<T>) => {
  const t = Date.now();
  try { return { ok: true, ms: Date.now() - t, value: await f() }; }
  catch (e) {
    const error = e instanceof Error ? e.message : e && typeof e === "object" ? JSON.stringify(e) : String(e);
    return { ok: false, ms: Date.now() - t, error };
  }
};

/** Setup check: which settings are present and whether each service answers. Shows no secrets. */
export async function GET() {
  const alts = altProviders();
  const env = {
    ai: hasClaude() ? `Claude (${MODEL})` : alts.length ? alts.map((a) => `${a.name} (${a.model})`).join(", then ") : "none, scripted lines",
    supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    sessionSecret: Boolean(process.env.SESSION_SECRET),
    cronSecret: Boolean(process.env.CRON_SECRET),
  };
  const [db, chain, meta, ai] = await Promise.all([
    time(async () => { const rows = await store().list("chogs", 1000); return `${rows.length} Chogs saved`; }),
    time(async () => { const u = await tokenURI(1); if (!u) throw new Error("Monad RPC gave no tokenURI"); return u.slice(0, 60); }),
    time(async () => { const m = await fetchMeta(1); if (!m.real) throw new Error(`Could not read Chog #1 metadata. ${lastMetaError}`); return `${m.name}: ${Object.keys(m.traits).join(", ")}`; }),
    time(async () => {
      const r = await askJSON<{ word: string }>({ system: "Reply in JSON.", messages: [{ role: "user", content: "Say one happy word." }], schema: obj({ word: str() }), maxTokens: 1000 });
      if (!r) throw new Error(env.ai.startsWith("none") ? "No AI key set" : `AI call failed. ${lastAltError}`);
      return r.word;
    }),
  ]);
  return json({ env, database: db, monad: chain, chogMetadata: meta, aiReply: ai });
}
