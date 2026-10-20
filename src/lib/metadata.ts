import { IPFS_GATEWAYS } from "./config";
import { tokenURI } from "./chain";
import BUNDLED from "@/data/chogs.json";

/** All 1,969 Chogs' traits, read from the collection once and shipped with the app, so the town never waits on IPFS. */
const LOCAL = BUNDLED as unknown as Record<string, { n: number; name: string; traits: Traits }>;
/** The Chog's art, served from our own origin (320px WebP in public/art). */
export const artUrl = (tokenId: number) => (LOCAL[tokenId] ? `/art/${LOCAL[tokenId].n}.webp` : null);

export type Traits = Record<string, string>;
export interface ChogMeta {
  name: string;
  image: string | null;
  traits: Traits;
  /** false when the chain or IPFS could not be reached and the traits are stand-ins */
  real: boolean;
}

const cid = (u: string) => u.slice(7).replace(/^ipfs\//, "");
export const ipfs = (u: string, gw = IPFS_GATEWAYS[0]) => (u.startsWith("ipfs://") ? gw + cid(u) : u);

/** Last metadata failure, shown on /api/health. */
export let lastMetaError = "";

/** Fetches a URL, trying each IPFS gateway in turn for ipfs:// links. */
export async function fetchIpfs(u: string, timeout = 8000) {
  const urls = u.startsWith("ipfs://") ? IPFS_GATEWAYS.map((g) => ipfs(u, g)) : [u];
  const errors: string[] = [];
  for (const url of urls) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(timeout) });
      if (r.ok) return r;
      errors.push(`${new URL(url).host} ${r.status}`);
    } catch (e) {
      errors.push(`${new URL(url).host} ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(errors.join("; "));
}

/** Reads the Chog's metadata from its tokenURI. Falls back to stand-in traits so the town still works offline. */
export async function fetchMeta(tokenId: number): Promise<ChogMeta> {
  const local = LOCAL[tokenId];
  if (local) return { name: local.name, image: artUrl(tokenId), traits: local.traits, real: true };
  const uri = await tokenURI(tokenId);
  if (uri) {
    try {
      let json: { name?: string; image?: string; attributes?: { trait_type?: string; value?: unknown }[] };
      if (uri.startsWith("data:application/json;base64,")) json = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
      else if (uri.startsWith("data:application/json")) json = JSON.parse(decodeURIComponent(uri.split(",")[1]));
      else {
        const r = await fetchIpfs(uri);
        json = await r.json();
      }
      const traits: Traits = {};
      for (const a of json.attributes ?? []) if (a.trait_type) traits[a.trait_type] = String(a.value);
      return { name: json.name || `Chog #${tokenId}`, image: json.image ?? null, traits, real: true };
    } catch (e) {
      lastMetaError = `#${tokenId} ${uri}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return { name: `Chog #${tokenId}`, image: null, traits: standInTraits(tokenId), real: false };
}

const pick = <T,>(a: T[], n: number) => a[n % a.length];
function standInTraits(id: number): Traits {
  const h = (k: number) => Math.abs(Math.imul(id + 1, 2654435761) ^ (k * 40503)) >>> 3;
  return {
    Eyes: pick(["Grumpy", "Wide", "Sleepy", "Side Eye", "Soft", "Teary", "Angry", "Glasses"], h(1)),
    Mouth: pick(["Frown", "Grin", "Smile", "Smirk", "Open", "Teeth", "Flat"], h(2)),
    Head: pick(["None", "Crown", "Chef Hat", "Headphones", "Cap", "Flower"], h(3)),
    Aura: pick(["Calm Lilac", "Golden Glow", "Storm", "Fire", "Sparkle", "None"], h(4)),
    Tier: pick(["1", "2", "3", "4", "5"], h(5)),
    Background: pick(["Night Market", "Palace", "Garden", "Arcade", "Harbor", "Clouds"], h(6)),
  };
}
