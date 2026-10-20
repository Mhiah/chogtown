export const CHOG_CONTRACT = "0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763" as const;
/** The $CHOG token on Monad (ERC-20, 18 decimals). */
export const CHOG_TOKEN = "0x350035555E10d9AfAF1566AaebfCeD5BA6C27777" as const;
export const CHOG_SUPPLY = 1969;
export const MONAD_CHAIN_ID = 143;
export const MONAD_RPC = process.env.MONAD_RPC_URL || "https://rpc.monad.xyz";
/** Tried in order; public IPFS gateways are often slow or rate-limited. */
export const IPFS_GATEWAYS = [process.env.IPFS_GATEWAY, "https://ipfs.io/ipfs/", "https://dweb.link/ipfs/", "https://gateway.pinata.cloud/ipfs/", "https://w3s.link/ipfs/"].filter(Boolean) as string[];
export const MODEL = process.env.CHOG_MODEL || "claude-haiku-5-5";
export const hasClaude = () => Boolean(process.env.ANTHROPIC_API_KEY);
/**
 * Alternatives when there is no Anthropic key, tried in this order until one answers:
 * xAI Grok (console.x.ai) and Groq (console.groq.com, free plan).
 */
export function altProviders() {
  const list: { name: string; url: string; key: string; model: string }[] = [];
  if (process.env.XAI_API_KEY) list.push({ name: "xAI", url: "https://api.x.ai/v1/chat/completions", key: process.env.XAI_API_KEY.trim(), model: process.env.XAI_MODEL || "grok-4.3" });
  if (process.env.GROQ_API_KEY) list.push({ name: "Groq", url: "https://api.groq.com/openai/v1/chat/completions", key: process.env.GROQ_API_KEY.trim(), model: process.env.GROQ_MODEL || "openai/gpt-oss-120b" });
  return list;
}
export const hasAI = () => hasClaude() || altProviders().length > 0;

/** Chogs that live in town from day one, so the first visitor finds neighbours, gossip and a debate. */
export const RESIDENT_IDS = [1204, 474, 88, 1203, 640, 77, 9, 1500, 300, 641, 512, 1969, 7, 1111, 250, 999,
  53, 1462, 1514, 1461, 900, 742, 158, 949, 1417, 680, 670, 1949, 981, 1525, 314, 1561, 439, 33, 120, 205, 377, 460, 588, 733, 812, 866, 1023, 1088, 1290, 1377, 1650, 1802];
/** Each night this many Chogs from the rest of the collection wake up and move in. */
export const NEWCOMERS_PER_NIGHT = 8;

/** UTC day key, e.g. 2026-10-14. The town's day rolls over at midnight UTC. */
export const today = (d = new Date()) => d.toISOString().slice(0, 10);
export const dayBefore = (day: string) => today(new Date(Date.parse(day + "T00:00:00Z") - 864e5));
