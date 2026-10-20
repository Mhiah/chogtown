/**
 * Rumble at the Royal Amphitheatre. The town's grudges, settled on the stage.
 * Opponents come from the town's own story (tonight's rival, a challenger, the champion),
 * fights move a Chog's stats and relationships, and big results make the Gazette.
 */
import { store } from "./store";
import { today, CHOG_SUPPLY } from "./config";
import { ARCHETYPES, nudge, type ArchetypeKey } from "./personality";
import { type Chog, allChogs, getChog, saveChog, label } from "./chogs";
import { artUrl } from "./metadata";
import { kitFor, kitLines } from "./kit";
import type { TownEvent } from "./night";

export const RANKED_PER_DAY = 6;

export interface Rumble { w: number; l: number; streak: number; best: number; day: string; fights: number; ko: number }
type WithRumble = Chog & { rumble?: Rumble };

export const record = (c: WithRumble): Rumble => {
  const r = c.rumble ?? { w: 0, l: 0, streak: 0, best: 0, day: "", fights: 0, ko: 0 };
  if (r.day !== today()) { r.day = today(); r.fights = 0; }
  return r;
};

const TAUNTS: Record<ArchetypeKey, string[]> = {
  critic: ["I've seen better footwork on a fountain statue.", "Let's get this over with. Quietly.", "You call that a stance?"],
  hype: ["LET'S GOOOO. Wait, are we fighting? LET'S GOOOO.", "THIS IS THE BIGGEST FIGHT IN CHOGTOWN HISTORY.", "I'm going to be SO famous after this."],
  dreamer: ["Do you ever think the stage is just a big plate?", "I'll knock you off gently. Like a cloud.", "Win or lose, the stars are still out."],
  schemer: ["I already know how this ends. You don't.", "Step a little closer to the edge. Trust me.", "Nothing personal. Mostly."],
  sweetheart: ["I'll be gentle! Probably! Drink water after.", "Whoever wins buys snacks, okay?", "I don't want to hurt you. I will, though."],
  drama: ["This is the most important night of my LIFE.", "Remember this moment. I will. Forever.", "The whole town is watching. As it should."],
  brawler: ["Name the time and place. It's here. It's now.", "You're on my stage.", "I've been waiting all week for this."],
  knowitall: ["Fun fact: you're about to lose.", "Statistically, this goes my way.", "Actually, the edge is closer than you think."],
};
const WIN_LINES: Record<ArchetypeKey, string> = {
  critic: "Adequate. Barely.", hype: "DID EVERYONE SEE THAT?", dreamer: "Oh. I won? Lovely.", schemer: "Exactly as planned.",
  sweetheart: "Are you okay? Great fight! Snacks?", drama: "I'd like to thank everyone. Everyone.", brawler: "Next.", knowitall: "As predicted.",
};
const LOSE_LINES: Record<ArchetypeKey, string> = {
  critic: "The stage was slippery. That's all.", hype: "REMATCH. REMATCH. REMATCH.", dreamer: "Falling felt kind of nice, honestly.", schemer: "You'll pay for that. Later.",
  sweetheart: "You were amazing. I'm fine. I'm fine!", drama: "Betrayed. By the floor itself.", brawler: "Again. Now.", knowitall: "Technically that was a fluke.",
};

const seeded = (s: number) => () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export function fighter(c: WithRumble) {
  const a = ARCHETYPES[c.archetype];
  const kit = kitFor(c.id, c.traits);
  const r = seeded(c.id * 31 + Number(today().replace(/-/g, "")));
  return {
    id: c.id, name: c.name, label: label(c), nftName: c.nftName, archetype: c.archetype, archetypeName: a.name,
    image: artUrl(c.id) ?? `/api/chog/${c.id}/image`, kit, lines: kitLines(kit),
    taunt: TAUNTS[c.archetype][Math.floor(r() * 3)], record: record(c),
  };
}
export type Fighter = ReturnType<typeof fighter>;

/** Today's three opponents for a Chog: its worst rival, a challenger from town, and the champion. */
export async function opponents(c: WithRumble) {
  const day = today();
  const r = seeded(c.id * 7 + Number(day.replace(/-/g, "")));
  const town = (await allChogs()) as WithRumble[];
  const out: { why: string; kind: "rival" | "challenger" | "champion"; f: Fighter }[] = [];
  const used = new Set([c.id]);
  // rival: the worst relationship, else an archetype that clashes
  const rivalId = Object.entries(c.rel).filter(([, x]) => x.kind === "rival").sort((x, y) => x[1].score - y[1].score)[0]?.[0];
  let rival = rivalId ? town.find((x) => x.id === Number(rivalId)) : undefined;
  if (!rival) rival = town.filter((x) => x.id !== c.id && ARCHETYPES[c.archetype].rival === x.archetype)[0];
  if (rival) { used.add(rival.id); out.push({ kind: "rival", why: rivalId ? `Your rival. ${c.rel[rival.id].nights} night${c.rel[rival.id].nights === 1 ? "" : "s"} of bad blood.` : `${ARCHETYPES[rival.archetype].name}s and ${ARCHETYPES[c.archetype].name}s never get along.`, f: fighter(rival) }); }
  // champion: most Rumble wins in town
  const champ = town.filter((x) => !used.has(x.id) && (x.rumble?.w ?? 0) > 0).sort((x, y) => (y.rumble?.w ?? 0) - (x.rumble?.w ?? 0))[0];
  if (champ) { used.add(champ.id); out.push({ kind: "champion", why: `Champion of the Amphitheatre, ${champ.rumble!.w} win${champ.rumble!.w === 1 ? "" : "s"}.`, f: fighter(champ) }); }
  // challengers: someone from town who's never met you, plus a stranger from the wider collection
  const pool = town.filter((x) => !used.has(x.id) && !c.rel[x.id]);
  const ch = pool[Math.floor(r() * pool.length)];
  if (ch) { used.add(ch.id); out.push({ kind: "challenger", why: `Lives in ${ch.district}. Wants your spot.`, f: fighter(ch) }); }
  if (out.length < 3) {
    let id = 1 + Math.floor(r() * CHOG_SUPPLY); while (used.has(id)) id = 1 + Math.floor(r() * CHOG_SUPPLY);
    const s = await getChog(id, { resident: true });
    out.push({ kind: "challenger", why: `Just moved to ${s.district}. Heard you're tough.`, f: fighter(s) });
  }
  return out;
}

export interface FightResult { won: boolean; myStocks: number; foeStocks: number; seconds: number; dealt: number }

/** Records a ranked fight for both Chogs. Returns what the winner and loser said. */
export async function recordFight(me: WithRumble, foe: WithRumble, res: FightResult) {
  const day = today();
  // attach the records first so every update below lands on the saved objects
  me.rumble = record(me); foe.rumble = record(foe);
  const [w, l] = res.won ? [me, foe] : [foe, me];
  const rw = w.rumble!, rl = l.rumble!;
  rw.w++; rw.streak++; rw.best = Math.max(rw.best, rw.streak); rl.l++; rl.streak = 0;
  me.rumble.fights++;
  const flawless = res.won && res.myStocks === 3;
  if (flawless) rw.ko++;
  w.stats = nudge(w.stats, { confidence: 2, chaos: 1 });
  l.stats = nudge(l.stats, { confidence: -1, chaos: 1 });
  // fighting makes it personal
  for (const [x, y] of [[me, foe], [foe, me]] as const) {
    const rel = x.rel[y.id] ?? { score: 0, nights: 0, last: day, kind: "neutral" as const };
    rel.score = Math.max(-10, rel.score - 1); rel.last = day;
    rel.kind = rel.score >= 2 ? "friend" : rel.score <= -2 ? "rival" : "neutral";
    x.rel[y.id] = rel;
  }
  if (rw.streak === 3 || flawless) w.moments = [...w.moments, { day, text: flawless ? `Flawless win over ${label(l)} at the Amphitheatre.` : `Three Rumble wins in a row.` }].slice(-20);
  await Promise.all([saveChog(me), saveChog(foe)]);
  // the Gazette covers the good ones
  const text = flawless
    ? `${label(w)} threw ${label(l)} off the Amphitheatre stage three times without losing a life. The crowd is still on its feet.`
    : rw.streak >= 3
      ? `${label(w)} is on a ${rw.streak}-fight Rumble streak after beating ${label(l)}. Somebody stop them.`
      : `${label(w)} beat ${label(l)} in the Rumble, ${res.won ? res.myStocks : res.foeStocks} lives to ${res.won ? res.foeStocks : res.myStocks}. ${l.name} wants a rematch.`;
  const e: TownEvent = { id: `${day}-rumble-${w.id}-${l.id}`, day, t: Date.now(), tag: "feud", text, chogs: [w.id, l.id], lovedBy: [] };
  await store().set("events", e.id, e);
  return { winLine: WIN_LINES[w.archetype], loseLine: LOSE_LINES[l.archetype], record: record(me) };
}

export const quotes = (winner: ArchetypeKey, loser: ArchetypeKey) => ({ winLine: WIN_LINES[winner], loseLine: LOSE_LINES[loser] });
