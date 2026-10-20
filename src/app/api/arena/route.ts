import { json, fail, actor } from "@/lib/api";
import { getSession } from "@/lib/session";
import { fighter, opponents, record, RANKED_PER_DAY } from "@/lib/arena";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Your fighter and today's three opponents. */
export async function GET() {
  const s = await getSession();
  if (!s?.tokenId) return json({ me: null });
  const a = await actor(s.tokenId);
  if ("error" in a) return fail(a.error, a.status);
  const r = record(a.c);
  return json({ me: fighter(a.c), opponents: await opponents(a.c), ranked: !a.guest, left: Math.max(0, RANKED_PER_DAY - r.fights) });
}
