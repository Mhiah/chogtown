import { json, fail } from "@/lib/api";
import { getSession } from "@/lib/session";
import { join, walk, play, pickSide, ringNow, CARDS, type CardKey } from "@/live/island";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Everything a viewer can do on the live island, as the Chog their session plays:
 * join (take control), walk (to a path node), card (play an intention card on another Chog), pick (a Main Event side).
 */
export async function POST(req: Request) {
  const s = await getSession();
  const b = await req.json().catch(() => ({}));
  if (b.kind === "ring") {
    const dev = process.env.NODE_ENV !== "production";
    if (!dev && (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)) return fail("Not allowed.", 401);
    return json(await ringNow());
  }
  if (!s) return fail("Pick a Chog to play first.", 401);
  if (b.kind === "pick") {
    if (b.side !== "a" && b.side !== "b") return fail("Pick a side.");
    const r = await pickSide(s.vid, b.side);
    return r.ok ? json(r) : fail(r.error!);
  }
  if (!s.tokenId) return fail("Pick a Chog to play first.", 401);
  let r: { ok: boolean; error?: string };
  if (b.kind === "join") r = await join(s.vid, s.tokenId);
  else if (b.kind === "walk" && typeof b.node === "string") r = await walk(s.vid, s.tokenId, b.node);
  else if (b.kind === "card" && Number.isInteger(b.target) && b.card in CARDS) r = await play(s.vid, s.tokenId, b.target, b.card as CardKey);
  else return fail("Unknown action.");
  return r.ok ? json(r) : fail(r.error ?? "That didn't work.");
}
