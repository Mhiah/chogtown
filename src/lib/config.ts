export const CHOG_CONTRACT = "0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763" as const;
export const CHOG_SUPPLY = 1969;
export const MONAD_CHAIN_ID = 143;
export const MONAD_RPC = process.env.MONAD_RPC_URL || "https://rpc.monad.xyz";
export const IPFS_GATEWAY = process.env.IPFS_GATEWAY || "https://ipfs.io/ipfs/";
export const MODEL = process.env.CHOG_MODEL || "claude-haiku-5-5";
export const hasClaude = () => Boolean(process.env.ANTHROPIC_API_KEY);
/**
 * Alternatives when there is no Anthropic key, tried in this order:
 * xAI Grok (console.x.ai, trial credit) and Groq (console.groq.com, free plan).
 */
export function altProvider() {
  if (process.env.XAI_API_KEY) return { name: "xAI", url: "https://api.x.ai/v1/chat/completions", key: process.env.XAI_API_KEY, model: process.env.XAI_MODEL || "grok-4.3" };
  if (process.env.GROQ_API_KEY) return { name: "Groq", url: "https://api.groq.com/openai/v1/chat/completions", key: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL || "openai/gpt-oss-120b" };
  return null;
}
export const hasAI = () => hasClaude() || altProvider() !== null;

/** Chogs that live in town from day one, so the first visitor finds neighbours, gossip and a debate. */
export const RESIDENT_IDS = [1204, 474, 88, 1203, 640, 77, 9, 1500, 300, 641, 512, 1969, 7, 1111, 250, 999];

/** UTC day key, e.g. 2026-10-14. The town's day rolls over at midnight UTC. */
export const today = (d = new Date()) => d.toISOString().slice(0, 10);
export const dayBefore = (day: string) => today(new Date(Date.parse(day + "T00:00:00Z") - 864e5));
