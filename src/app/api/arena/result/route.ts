import { json, fail, actor, parseId } from "@/lib/api";
import { getSession } from "@/lib/session";
import { loadChog } from "@/lib/chogs";
import { record, recordFight, quotes, RANKED_PER_DAY } from "@/lib/arena";

export const dynamic = "force-dynamic";

/** Records a finished fight. Guests' fights are exhibitions: the quotes come back, nothing is saved. */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s?.tokenId) return fail("Pick a Chog first.", 401);
  const a = await actor(s.tokenId);
  if ("error" in a) return fail(a.error, a.status);
  const b = await req.json().catch(() => ({}));
  const foeId = parseId(b.foe);
  const foe = foeId ? await loadChog(foeId) : null;
  if (!foe || foe.id === a.c.id) return fail("Unknown opponent.");
  const res = { won: !!b.won, myStocks: Math.max(0, Math.min(3, Number(b.myStocks) || 0)), foeStocks: Math.max(0, Math.min(3, Number(b.foeStocks) || 0)), seconds: Number(b.seconds) || 0, dealt: Number(b.dealt) || 0 };
  if (res.won && (res.myStocks < 1 || res.seconds < 8)) return fail("That fight didn't add up.");
  const [w, l] = res.won ? [a.c, foe] : [foe, a.c];
  if (a.guest) return json({ ranked: false, ...quotes(w.archetype, l.archetype) });
  if (record(a.c).fights >= RANKED_PER_DAY) return json({ ranked: false, limit: true, ...quotes(w.archetype, l.archetype) });
  return json({ ranked: true, ...(await recordFight(a.c, foe, res)), left: Math.max(0, RANKED_PER_DAY - record(a.c).fights) });
}
