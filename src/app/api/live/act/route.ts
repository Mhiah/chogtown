import { json, fail, canPlay, WATCH_ONLY } from "@/lib/api";
import { getSession, setSession, newVid } from "@/lib/session";
import { join, walk, play, pickSide, ringNow, CARDS, type AnyCard } from "@/live/island";
import { POWERS } from "@/lib/powers";

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
  if (b.kind === "pick") {
    // anyone watching can call a side, no Chog needed
    let v = s;
    if (!v) { v = { vid: newVid() }; await setSession(v); }
    if (b.side !== "a" && b.side !== "b") return fail("Pick a side.");
    const r = await pickSide(v.vid, b.side);
    return r.ok ? json(r) : fail(r.error!);
  }
  if (!s) return fail("Pick a Chog to play first.", 401);
  if (!s.tokenId) return fail("Pick a Chog to play first.", 401);
  if (!canPlay(s)) return fail(WATCH_ONLY, 403);
  let r: { ok: boolean; error?: string };
  if (b.kind === "join") r = await join(s.vid, s.tokenId);
  else if (b.kind === "walk" && typeof b.node === "string") r = await walk(s.vid, s.tokenId, b.node);
  // a holder signed in with the wallet that owns this Chog (checked on Monad when they picked it)
  else if (b.kind === "card" && Number.isInteger(b.target) && (b.card in CARDS || b.card in POWERS)) r = await play(s.vid, s.tokenId, b.target, b.card as AnyCard, (!!s.address && !s.guest) || !!s.judge);
  else return fail("Unknown action.");
  return r.ok ? json(r) : fail(r.error ?? "That didn't work.");
}
