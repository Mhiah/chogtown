import { json, fail, actor } from "@/lib/api";
import { getSession } from "@/lib/session";
import { boothRecord, saveRun } from "@/lib/booth";
const RUN_S = 60; // matches RUN_S in src/booth/stage.js

export const dynamic = "force-dynamic";

/** Your Chog's Face Booth record. */
export async function GET() {
  const s = await getSession();
  if (!s?.tokenId) return json({ record: null });
  const a = await actor(s.tokenId);
  if ("error" in a) return fail(a.error, a.status);
  return json({ record: boothRecord(a.c), ranked: !a.guest });
}

/** Saves a finished run. Guests' runs are just for fun and aren't stored. */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s?.tokenId) return fail("Pick a Chog first.", 401);
  const a = await actor(s.tokenId);
  if ("error" in a) return fail(a.error, a.status);
  const b = await req.json().catch(() => ({}));
  const score = Math.round(Number(b.score) || 0), seconds = Number(b.seconds) || 0, kills = Number(b.kills) || 0;
  // a run is at most 60 seconds, and each blasted jeet is worth at most 80
  if (score < 0 || seconds > RUN_S + 2 || score > kills * 80 || kills > seconds * 4 + 4) return fail("That run didn't add up.");
  if (a.guest) return json({ ranked: false, record: boothRecord(a.c) });
  return json({ ranked: true, ...(await saveRun(a.c, score)) });
}
