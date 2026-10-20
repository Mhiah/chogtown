/**
 * What a wallet unlocks in Chogtown. Read-only: we only ever read balances on Monad.
 * Holding a Chog Genesis NFT crowns your Chog on the island, lets it call out rivals early and opens the
 * high-roller bets. Holding $CHOG tops up your daily chips by tier.
 */
import { getAddress, formatUnits, type Address } from "viem";
import { client, chogsOf } from "./chain";
import { CHOG_TOKEN } from "./config";

export const TIERS = [
  { key: "whale", name: "Whale", min: 250_000, daily: 1500 },
  { key: "roller", name: "High roller", min: 25_000, daily: 500 },
  { key: "holder", name: "$CHOG holder", min: 1_000, daily: 200 },
] as const;
export type Tier = (typeof TIERS)[number]["key"] | "none";

export interface Perks { nfts: number; chog: number; tier: Tier; tierName: string | null; daily: number; highRoller: boolean }
export const NO_PERKS: Perks = { nfts: 0, chog: 0, tier: "none", tierName: null, daily: 0, highRoller: false };

const erc20 = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] }] as const;
const cache = new Map<string, { at: number; p: Perks }>();

export async function chogBalance(a: Address) {
  const raw = await client.readContract({ address: CHOG_TOKEN, abi: erc20, functionName: "balanceOf", args: [a] });
  return Number(formatUnits(raw, 18));
}

export async function perksOf(address?: string | null): Promise<Perks> {
  if (!address) return NO_PERKS;
  const a = getAddress(address);
  const hit = cache.get(a);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.p;
  const [nfts, chog] = await Promise.all([
    chogsOf(a).then((r) => r.balance).catch(() => 0),
    chogBalance(a).catch(() => 0),
  ]);
  const t = TIERS.find((x) => chog >= x.min);
  const p: Perks = { nfts, chog: Math.floor(chog), tier: t?.key ?? "none", tierName: t?.name ?? null, daily: t?.daily ?? 0, highRoller: nfts > 0 || t?.key === "roller" || t?.key === "whale" };
  cache.set(a, { at: Date.now(), p });
  return p;
}
