import { store } from "./store";
import { fetchMeta, type Traits } from "./metadata";
import { askJSON, obj, str } from "./claude";
import { today } from "./config";
import {
  ARCHETYPES, archetypeFor, flavorFor, districtFor, startingStats, moodLine, STAT_KEYS,
  type ArchetypeKey, type Flavor, type Stats,
} from "./personality";

export interface Relation { score: number; nights: number; last: string; kind: "friend" | "rival" | "neutral" }
export interface Chog {
  id: number;
  name: string;
  nftName: string;
  image: string | null;
  traits: Traits;
  real: boolean;
  archetype: ArchetypeKey;
  flavor: Flavor;
  district: string;
  backstory: string;
  base: Stats;
  stats: Stats;
  drift: { day: string; used: Partial<Stats> };
  statLog: { day: string; stats: Stats }[];
  streak: { count: number; best: number; last: string | null; days: string[] };
  wins: number;
  losses: number;
  look: { hat: string; aura: string };
  rel: Record<string, Relation>;
  moments: { day: string; text: string }[];
  report: { day: string; text: string; with: number } | null;
  owner: string | null;
  ownerCheckedAt: number;
  resident: boolean;
  /** true once Claude has named it and written its backstory */
  storied: boolean;
  /** last time we retried reading real traits for a Chog built from stand-ins */
  metaTriedAt?: number;
  createdAt: number;
}

const NAMES: Record<ArchetypeKey, string[]> = {
  critic: ["Grumble", "Sourpuss", "Scowl", "Mutter", "Crankshaw"],
  hype: ["Sunny", "Blaze", "Zoomie", "Sparks", "Boom"],
  dreamer: ["Moonbean", "Drift", "Nebula", "Wisp", "Lull"],
  schemer: ["Whisper", "Velvet", "Slyde", "Fox", "Murmur"],
  sweetheart: ["Honeybun", "Peaches", "Dumpling", "Cuddles", "Marsh"],
  drama: ["Diva", "Tragedy", "Encore", "Spotlight", "Sobsworth"],
  brawler: ["Knuckles", "Bruiser", "Tank", "Rumble", "Crusher"],
  knowitall: ["Professor", "Footnote", "Fact", "Index", "Quill"],
};
const TITLES: Record<string, string> = { Royal: "Lord", Foodie: "Chef", "Music snob": "DJ", Competitor: "Coach", Gentle: "Petal" };

function defaultName(id: number, arch: ArchetypeKey, flavor: Flavor) {
  const core = NAMES[arch][id % NAMES[arch].length];
  const t = TITLES[flavor.label];
  return t && core !== "Professor" ? `${t} ${core}` : core;
}

function templateBackstory(c: Pick<Chog, "name" | "archetype" | "district" | "flavor">) {
  const a = ARCHETYPES[c.archetype];
  return `${c.name} lives in ${c.district}. ${a.name.replace("The ", "A ")} through and through: loves ${a.loves}, can't stand ${a.hates}. ${c.flavor.line}`;
}

export const chogKey = (id: number) => String(id);

export async function loadChog(id: number) {
  return store().get<Chog>("chogs", chogKey(id));
}

export async function saveChog(c: Chog) {
  const day = today();
  const last = c.statLog[c.statLog.length - 1];
  if (!last || last.day !== day) c.statLog.push({ day, stats: { ...c.stats } });
  else last.stats = { ...c.stats };
  c.statLog = c.statLog.slice(-14);
  await store().set("chogs", chogKey(c.id), c);
}

/** Loads a Chog, bringing it to life from its on-chain traits the first time. */
export async function getChog(id: number, opts: { resident?: boolean; story?: boolean } = {}): Promise<Chog> {
  const found = await loadChog(id);
  if (found) return found.real ? found : refreshTraits(found);
  const meta = await fetchMeta(id);
  const archetype = archetypeFor(meta.traits), flavor = flavorFor(meta.traits), district = districtFor(meta.traits);
  const base = startingStats(meta.traits, archetype, flavor);
  const c: Chog = {
    id, name: defaultName(id, archetype, flavor), nftName: meta.name, image: meta.image, traits: meta.traits, real: meta.real,
    archetype, flavor, district, backstory: "", base, stats: { ...base },
    drift: { day: today(), used: {} }, statLog: [], streak: { count: 0, best: 0, last: null, days: [] },
    wins: 0, losses: 0, look: { hat: "none", aura: "gold" }, rel: {}, moments: [], report: null,
    owner: null, ownerCheckedAt: 0, resident: !!opts.resident, storied: false, createdAt: Date.now(),
  };
  c.backstory = templateBackstory(c);
  if (opts.story) await writeStory(c);
  await saveChog(c);
  return c;
}

/**
 * A Chog created while the chain or IPFS was unreachable has stand-in traits. Retry every
 * ten minutes; once the real traits arrive, rebuild its character and keep its drift so far.
 */
async function refreshTraits(c: Chog) {
  if (Date.now() - (c.metaTriedAt ?? 0) < 600e3) return c;
  c.metaTriedAt = Date.now();
  const meta = await fetchMeta(c.id);
  if (meta.real) {
    const archetype = archetypeFor(meta.traits), flavor = flavorFor(meta.traits);
    const base = startingStats(meta.traits, archetype, flavor);
    for (const k of STAT_KEYS) c.stats[k] = Math.max(0, Math.min(100, c.stats[k] - c.base[k] + base[k]));
    Object.assign(c, { nftName: meta.name, image: meta.image, traits: meta.traits, real: true, archetype, flavor, district: districtFor(meta.traits), base });
    if (!c.storied) { c.name = defaultName(c.id, archetype, flavor); c.backstory = templateBackstory(c); }
  }
  await saveChog(c);
  return c;
}

/** Claude names the Chog and writes its backstory from the character sheet (bible: "written by the AI from all of the above"). */
export async function writeStory(c: Chog) {
  const a = ARCHETYPES[c.archetype];
  const out = await askJSON<{ name: string; backstory: string }>({
    system: "You write characters for Chogtown, a cosy, funny floating town where every Chog NFT is a living character. Keep it playful and PG. Names are one or two words, memorable, and never include the token number.",
    messages: [{ role: "user", content: `Name this Chog and write its backstory in two short sentences, in the style of: "Chef Grumble. Ran the best noodle stall in the Night Market until a Hype Chog called it 'mid' in front of everyone. Hasn't forgiven anyone since."\n\nToken: #${c.id}\nTraits: ${JSON.stringify(c.traits)}\nArchetype: ${a.name} (voice: ${a.voice} Loves ${a.loves}. Hates ${a.hates}. Fear: ${a.fear}.)\nFlavor: ${c.flavor.label}. ${c.flavor.line}\nHome district: ${c.district}\nCurrent working name: ${c.name}` }],
    schema: obj({ name: str("The Chog's name"), backstory: str("Two short sentences, third person, without the name at the start") }),
  });
  if (out?.name) c.name = out.name.slice(0, 32);
  if (out?.backstory) c.backstory = out.backstory.slice(0, 400);
  if (out?.name && out.backstory) c.storied = true;
}

export const label = (c: Pick<Chog, "name" | "id">) => `${c.name} #${c.id}`;

/** Change per stat over the last week, for the "who it is becoming" bars. */
export function weekDelta(c: Chog) {
  const ref = c.statLog.length > 1 ? c.statLog[Math.max(0, c.statLog.length - 8)].stats : c.base;
  return Object.fromEntries(STAT_KEYS.map((k) => [k, c.stats[k] - ref[k]])) as Stats;
}

/** What anyone in town may see about a Chog. */
export function publicChog(c: Chog) {
  const a = ARCHETYPES[c.archetype];
  const rels = Object.entries(c.rel)
    .filter(([, r]) => r.kind !== "neutral")
    .sort((x, y) => Math.abs(y[1].score) - Math.abs(x[1].score))
    .slice(0, 6)
    .map(([id, r]) => ({ id: Number(id), ...r }));
  return {
    id: c.id, name: c.name, nftName: c.nftName, image: c.image, traits: c.traits, real: c.real,
    archetype: a.name, archetypeKey: c.archetype, flavor: c.flavor.label, flavorLine: c.flavor.line, district: c.district,
    backstory: c.backstory, stats: c.stats, delta: weekDelta(c), mood: moodLine(c.stats, c.base),
    streak: c.streak, wins: c.wins, losses: c.losses, look: c.look, relations: rels,
    moments: c.moments.slice(-5).reverse(), report: c.report, sample: a.sample,
  };
}
export type PublicChog = ReturnType<typeof publicChog>;

export async function allChogs() {
  return store().list<Chog>("chogs", 1000);
}
