import { json, fail } from "@/lib/api";
import { getSession, setSession, newVid, type Session } from "@/lib/session";
import { getChog, label } from "@/lib/chogs";
import { wallet, spin, highRollers, allowedBet, BETS, HIGH_BETS, START_CHIPS, DAILY_CHIPS } from "@/lib/casino";
import { perksOf } from "@/lib/perks";
import { betMain, myBet } from "@/live/island";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function who() {
  let s: Session | null = await getSession();
  if (!s) { s = { vid: newVid() }; await setSession(s); }
  const name = s.tokenId ? label(await getChog(s.tokenId)) : null;
  const p = await perksOf(s.address);
  // judges get the holder experience, high-roller table included
  const perks = s.judge ? { ...p, highRoller: true } : p;
  return { s, name: name ?? "A guest", perks };
}

/** The Lucky Lilypad: your chips (with today's top-up), and the high rollers. */
export async function GET() {
  const { s, name, perks } = await who();
  const { w, topUp } = await wallet(s.vid, name, perks.daily);
  const bets = perks.highRoller ? [...BETS, ...HIGH_BETS] : [...BETS];
  return json({ chips: w.chips, topUp, spins: w.spins, best: w.best, bets, start: START_CHIPS, daily: DAILY_CHIPS + perks.daily, perks, board: await highRollers(), myBet: await myBet(s.vid) });
}

/** spin: Chog Slots. bet: chips on a Main Event side. */
export async function POST(req: Request) {
  const { s, name, perks } = await who();
  const b = await req.json().catch(() => ({}));
  try {
    if (b.kind === "spin") return json(await spin(s.vid, Number(b.bet), name, perks.highRoller, perks.daily));
    if (b.kind === "bet") {
      const amount = Number(b.amount);
      if ((b.side !== "a" && b.side !== "b") || !allowedBet(amount, perks.highRoller)) return fail("Pick a side and a bet.");
      const r = await betMain(s.vid, b.side, amount, name);
      return r.ok ? json(r) : fail(r.error!);
    }
  } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
  return fail("Unknown action.");
}
