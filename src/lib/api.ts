import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { getSession, type Session } from "./session";
import { ownerOf } from "./chain";
import { getChog, saveChog, type Chog } from "./chogs";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export function parseId(v: string | number | undefined) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 100000 ? n : null;
}

export const allowUnverified = () => process.env.ALLOW_UNVERIFIED_CLAIMS === "1";

/**
 * Confirms on-chain that `address` still holds Chog `id`. Re-checks at most hourly.
 * Returns false if the chain says someone else owns it. If the chain can't be reached,
 * an earlier verified owner is trusted until it can.
 */
export async function verifyOwner(c: Chog, address: string, force = false) {
  const addr = getAddress(address);
  if (!force && c.owner === addr && Date.now() - c.ownerCheckedAt < 3600e3) return true;
  let onchain = await ownerOf(c.id);
  if (onchain === null) {
    if (c.owner === addr) return true;
    if (!allowUnverified()) return false;
    onchain = addr; // local testing without a reachable Monad RPC
  }
  if (onchain !== addr) return false;
  if (c.owner !== addr) {
    // New owner: stats, friends and history stay with the token; the streak and chats start fresh.
    c.owner = addr;
    c.streak = { count: 0, best: c.streak.best, last: null, days: [] };
  }
  c.ownerCheckedAt = Date.now();
  await saveChog(c);
  return true;
}

/** Who may play: holders playing their own Chog (checked on Monad when they picked it), and judges. Everyone else watches. */
export const canPlay = (s: Session | null) => !!s && (!!s.judge || (!!s.address && !s.guest && !!s.tokenId));
export const WATCH_ONLY = "You're watching. Sign in with a wallet that holds a Chog to play.";

/** The visitor's session and their Chog, if they may act as its owner. Guests only watch; judges play like guests used to. */
export async function actor(id: number): Promise<{ s: Session; c: Chog; guest: boolean } | { error: string; status: number }> {
  const s = await getSession();
  if (!s || s.tokenId !== id) return { error: "Pick this Chog first.", status: 401 };
  const c = await getChog(id);
  if (s.guest) return s.judge ? { s, c, guest: true } : { error: WATCH_ONLY, status: 403 };
  if (!s.address || !(await verifyOwner(c, s.address))) return { error: "This wallet no longer holds this Chog.", status: 403 };
  return { s, c, guest: false };
}
