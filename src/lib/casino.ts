/**
 * The Lucky Lilypad Casino. Play chips only: everyone starts with a stack, gets a top-up every day, and
 * nothing is bought or cashed out. Chog Slots runs on the server so nobody can rig a spin, and the
 * Main Event book is a pool: winners split everything bet on the fight.
 */
import { store } from "./store";
import { today } from "./config";
import type { TownEvent } from "./night";

export const START_CHIPS = 500;
export const DAILY_CHIPS = 200;
export const BETS = [10, 25, 50, 100] as const;

export interface Wallet { vid: string; chips: number; day: string; name: string; spins: number; best: number; won: number; jackpots: number }

// reel symbols, rarest first; the jeet never pays
export const SYMBOLS = [
  // pays back about 93% over time: chips go further than nothing, but the house still wins
  { key: "frog", w: 1, x3: 50 }, { key: "crown", w: 2, x3: 20 }, { key: "cap", w: 3, x3: 10 },
  { key: "heart", w: 4, x3: 8 }, { key: "glasses", w: 4, x3: 5 }, { key: "jeet", w: 5, x3: 0 },
] as const;
export type Sym = (typeof SYMBOLS)[number]["key"];
const TOTAL_W = SYMBOLS.reduce((s, x) => s + x.w, 0);
const roll = (): Sym => { let r = Math.random() * TOTAL_W; for (const s of SYMBOLS) { if ((r -= s.w) < 0) return s.key; } return "jeet"; };

/** What a spin pays, as a multiple of the bet. Three of a kind pays its line, any pair (not jeets) doubles, a frog anywhere gives the bet back. */
export function payout(reels: Sym[]) {
  const [a, b, c] = reels;
  if (a === b && b === c) return { x: SYMBOLS.find((s) => s.key === a)!.x3, line: a === "jeet" ? "Triple jeet. Ouch." : `Three ${a === "glasses" ? "glasses" : a + "s"}!` };
  const pair = a === b ? a : b === c ? b : a === c ? a : null;
  if (pair && pair !== "jeet") return { x: 2, line: "A pair. Double up." };
  if (reels.includes("frog")) return { x: 1, line: "Frog Dad covers your bet." };
  return { x: 0, line: reels.includes("jeet") ? "Jeeted." : "No luck this time." };
}

export async function wallet(vid: string, name?: string) {
  const day = today();
  let w = await store().get<Wallet>("wallets", vid);
  let topUp = 0;
  if (!w) { w = { vid, chips: START_CHIPS, day, name: name ?? "A guest", spins: 0, best: 0, won: 0, jackpots: 0 }; topUp = START_CHIPS; }
  else if (w.day !== day) { w.chips += DAILY_CHIPS; w.day = day; topUp = DAILY_CHIPS; }
  if (name) w.name = name;
  if (topUp) await store().set("wallets", vid, w);
  return { w, topUp };
}

async function save(w: Wallet) { await store().set("wallets", w.vid, w); }

export async function spin(vid: string, bet: number, name?: string) {
  if (!BETS.includes(bet as (typeof BETS)[number])) throw new Error("Pick a bet: 10, 25, 50 or 100 chips.");
  const { w } = await wallet(vid, name);
  if (w.chips < bet) throw new Error(`You need ${bet} chips for that spin. Fresh chips arrive tomorrow.`);
  const reels = [roll(), roll(), roll()];
  const { x, line } = payout(reels);
  const win = bet * x;
  w.chips += win - bet; w.spins++; w.won += Math.max(0, win - bet); w.best = Math.max(w.best, win);
  if (x === 50) {
    w.jackpots++;
    const e: TownEvent = { id: `${today()}-casino-${vid.slice(0, 8)}-${Date.now()}`, day: today(), t: Date.now(), tag: "chaos", text: `${w.name} hit the Frog Dad jackpot at the Lucky Lilypad: ${win.toLocaleString()} chips on a single spin. The frogs are still croaking.`, chogs: [], lovedBy: [] };
    await store().set("events", e.id, e);
  }
  await save(w);
  return { reels, x, win, line, chips: w.chips };
}

/** Moves chips in or out of a wallet (Main Event bets and payouts). Returns the new balance, or null if it can't afford it. */
export async function adjust(vid: string, d: number, name?: string) {
  const { w } = await wallet(vid, name);
  if (w.chips + d < 0) return null;
  w.chips += d; if (d > 0) w.won += d;
  await save(w);
  return w.chips;
}

export async function highRollers(limit = 8) {
  const all = await store().list<Wallet>("wallets", 1000);
  return all.filter((w) => w.spins > 0 || w.chips !== START_CHIPS).sort((a, b) => b.chips - a.chips).slice(0, limit)
    .map((w) => ({ name: w.name, chips: w.chips, best: w.best, jackpots: w.jackpots }));
}
