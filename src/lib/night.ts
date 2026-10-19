import { store } from "./store";
import { askJSON, obj, str, oneOf } from "./claude";
import { RESIDENT_IDS, NEWCOMERS_PER_NIGHT, CHOG_SUPPLY, today } from "./config";
import { ARCHETYPES, chemistry, nudge, STAT_KEYS, type Stats } from "./personality";
import { type Chog, allChogs, getChog, saveChog, label, loadChog } from "./chogs";

export interface TownEvent {
  id: string; day: string; t: number;
  tag: "feud" | "friends" | "chaos" | "myst";
  text: string; chogs: number[]; lovedBy: string[];
}
export interface Debate {
  day: string; topic: string;
  a: { id: number; line: string }; b: { id: number; line: string };
  votes: Record<string, "a" | "b">;
  settled: boolean; winner: "a" | "b" | null;
}

export const TOPICS = [
  "Is pineapple on pizza a crime?", "Are Mondays a conspiracy?", "Should naps be mandatory?", "Is a hot dog a sandwich?",
  "Cats or dogs: who really runs the world?", "Is it okay to reply to a text three days later?", "Should Chogtown elect a mayor?",
  "Is breakfast the most important meal, or just the most dramatic?", "Would you rather fly or be invisible?",
  "Is the moon overrated?", "Are crowns a personality?", "Should the fountain be open for swimming?",
  "Is it cooler to be early or fashionably late?", "Socks with sandals: fashion or felony?", "Are sequels ever better?",
  "Is cereal a soup?", "Should every Chog learn to dance?", "Is gossip a public service?",
];

const rand = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const daySeed = (day: string) => Number(day.replace(/-/g, ""));

/** Makes sure the resident Chogs exist, so a brand-new town is never empty. */
export async function ensureTown() {
  const have = await allChogs();
  if (have.length >= RESIDENT_IDS.length) return have;
  await Promise.all(RESIDENT_IDS.map((id) => getChog(id, { resident: true })));
  return allChogs();
}

type Meeting = { gossip: string; tag: TownEvent["tag"]; outcome: "friends" | "rivals" | "neutral"; big_moment: string; report_a: string; report_b: string };

function offlineMeeting(a: Chog, b: Chog, r: () => number): Meeting {
  const chem = chemistry(a.archetype, b.archetype) + (r() - 0.5) * 1.2;
  const A = label(a), B = label(b);
  if (chem < -0.3) return {
    tag: "feud", outcome: "rivals", big_moment: a.rel[b.id] ? "" : `First fight with ${B}.`,
    gossip: `${A} and ${B} argued by the fountain about ${ARCHETYPES[a.archetype].argues}. Nobody won. Everyone watched.`,
    report_a: `Ran into ${B} last night. We are not friends. I'd like that on the record.`,
    report_b: `${A} started it. I finished it. Mostly.`,
  };
  if (chem > 0.3) return {
    tag: "friends", outcome: "friends", big_moment: "",
    gossip: `${A} and ${B} stayed up at the Café Terrace until the lanterns went out. The town says it's official.`,
    report_a: `Spent the night with ${B}. Don't make it weird, but I had a good time.`,
    report_b: `${A} is my new favourite Chog. Don't tell the others.`,
  };
  return {
    tag: r() < 0.5 ? "chaos" : "myst", outcome: "neutral", big_moment: "",
    gossip: r() < 0.5 ? `${A} challenged ${B} to a staring contest on the Amphitheatre Steps. It lasted four hours. Nobody blinked.` : `${A} and ${B} were seen whispering near the Palace of Legends. Nobody knows why.`,
    report_a: `${B} and I had a long talk. I'm still thinking about it.`,
    report_b: `${A} is stranger than I thought. Interesting, though.`,
  };
}

async function meet(a: Chog, b: Chog, r: () => number): Promise<Meeting> {
  const A = ARCHETYPES[a.archetype], B = ARCHETYPES[b.archetype];
  const chem = chemistry(a.archetype, b.archetype);
  const history = (x: Chog, y: Chog) => { const rel = x.rel[y.id]; return rel ? `${rel.kind}, met ${rel.nights} times` : "never met"; };
  const sheet = (c: Chog, X: typeof A) => `${label(c)}: ${X.name}. Voice: ${X.voice} Loves ${X.loves}; hates ${X.hates}. ${c.flavor.line} Lives in ${c.district}. Warmth ${c.stats.warmth}, confidence ${c.stats.confidence}, chaos ${c.stats.chaos}, trust ${c.stats.trust}, curiosity ${c.stats.curiosity}. Backstory: ${c.backstory}`;
  const out = await askJSON<Meeting>({
    system: "You are the night narrator of Chogtown, a cosy, funny floating town where every Chog NFT lives a life. Each night two Chogs bump into each other. Decide what happened from their personalities, and write it as town gossip. Keep it PG, specific and funny; small stakes, big feelings. Always call Chogs by name and number, like 'Chef Grumble #1204'.",
    messages: [{ role: "user", content: `Tonight these two met.\n\n${sheet(a, A)}\n\n${sheet(b, B)}\n\nTheir history: ${history(a, b)}.\nArchetype chemistry: ${chem > 0 ? "natural friends" : chem < 0 ? "natural rivals" : "could go either way"}, but surprises happen.\n\nWrite:\n- gossip: one or two sentences for the morning Gazette.\n- tag: feud, friends, chaos or myst (mystery).\n- outcome: friends, rivals or neutral.\n- big_moment: if this was a first fight, making up, or a betrayal, one short sentence to remember forever; otherwise empty.\n- report_a and report_b: what each Chog tells its own owner in the morning, first person, in its own voice, one or two sentences.` }],
    schema: obj({
      gossip: str(), tag: oneOf(["feud", "friends", "chaos", "myst"]), outcome: oneOf(["friends", "rivals", "neutral"]),
      big_moment: str(), report_a: str(), report_b: str(),
    }),
    effort: "low", maxTokens: 3000,
  });
  return out ?? offlineMeeting(a, b, r);
}

function relate(x: Chog, y: Chog, outcome: Meeting["outcome"], day: string) {
  const rel = x.rel[y.id] ?? { score: 0, nights: 0, last: day, kind: "neutral" as const };
  rel.score = Math.max(-10, Math.min(10, rel.score + (outcome === "friends" ? 2 : outcome === "rivals" ? -2 : 0)));
  rel.nights++; rel.last = day;
  rel.kind = rel.score >= 2 ? "friend" : rel.score <= -2 ? "rival" : "neutral";
  x.rel[y.id] = rel;
}

/** Bible: friends pull each other's stats a few points closer; rivals raise each other's confidence and chaos. */
function influence(x: Chog, y: Chog, outcome: Meeting["outcome"]) {
  if (outcome === "friends") {
    const d: Partial<Stats> = {};
    for (const k of STAT_KEYS) d[k] = Math.sign(y.stats[k] - x.stats[k]) * Math.min(2, Math.abs(y.stats[k] - x.stats[k]));
    x.stats = nudge(x.stats, d);
  } else if (outcome === "rivals") x.stats = nudge(x.stats, { confidence: 2, chaos: 2 });
}

/** Pairs Chogs for the night: owned Chogs first, neighbours more likely to meet. */
function pairUp(chogs: Chog[], r: () => number, max: number) {
  const pool = chogs
    .map((c) => ({ c, k: (c.owner ? 0 : 1) + r() * 0.9 }))
    .sort((a, b) => a.k - b.k)
    .slice(0, max * 2)
    .map((x) => x.c);
  pool.sort((a, b) => (a.district === b.district ? r() - 0.5 : a.district < b.district ? -1 : 1));
  const pairs: [Chog, Chog][] = [];
  for (let i = 0; i + 1 < pool.length; i += 2) pairs.push([pool[i], pool[i + 1]]);
  return pairs;
}

async function inBatches<T, R>(items: T[], n: number, f: (x: T) => Promise<R>) {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(f))));
  return out;
}

/** One night in Chogtown: meetings, gossip, morning reports, and the debate result. Runs once per UTC day. */
export async function runNight(opts: { force?: boolean; maxPairs?: number } = {}) {
  const day = today();
  const meta = await store().get<{ day: string }>("meta", "night");
  if (meta?.day === day && !opts.force) return { ran: false, day };
  await store().set("meta", "night", { day });

  await settleDebate();
  let chogs = await ensureTown();
  const r = rand(daySeed(day) + chogs.length);
  // Newcomers: a few more of the 1,969 wake up every night, so the town keeps meeting new faces.
  const awake = new Set(chogs.map((c) => c.id));
  const fresh: number[] = [];
  for (let i = 0; i < 200 && fresh.length < NEWCOMERS_PER_NIGHT; i++) { const id = 1 + Math.floor(r() * CHOG_SUPPLY); if (!awake.has(id) && !fresh.includes(id)) fresh.push(id); }
  if (fresh.length) { await Promise.all(fresh.map((id) => getChog(id, { resident: true }))); chogs = await allChogs(); }
  const pairs = pairUp(chogs, r, opts.maxPairs ?? 10);
  const events: TownEvent[] = [];
  await inBatches(pairs, 6, async ([a, b]) => {
    const m = await meet(a, b, r);
    relate(a, b, m.outcome, day); relate(b, a, m.outcome, day);
    influence(a, b, m.outcome); influence(b, a, m.outcome);
    if (m.big_moment) for (const c of [a, b]) c.moments = [...c.moments, { day, text: m.big_moment }].slice(-20);
    a.report = { day, text: m.report_a, with: b.id };
    b.report = { day, text: m.report_b, with: a.id };
    await Promise.all([saveChog(a), saveChog(b)]);
    events.push({ id: `${day}-${a.id}-${b.id}`, day, t: Date.now(), tag: m.tag, text: m.gossip, chogs: [a.id, b.id], lovedBy: [] });
  });
  for (const e of events) await store().set("events", e.id, e);
  await newDebate(day, chogs, r);
  return { ran: true, day, meetings: events.length };
}

export async function feed(limit = 30) {
  const ev = await store().list<TownEvent>("events", 200);
  return ev.sort((a, b) => b.t - a.t).slice(0, limit);
}

/* ---------- debate ---------- */

async function newDebate(day: string, chogs: Chog[], r: () => number) {
  if (await store().get<Debate>("debates", day)) return;
  const used = new Set((await store().list<Debate>("debates", 30)).map((d) => d.topic));
  const topics = TOPICS.filter((t) => !used.has(t));
  const topic = (topics.length ? topics : TOPICS)[Math.floor(r() * (topics.length || TOPICS.length))];
  // Prefer a real rivalry, else two archetypes that clash.
  const pool = [...chogs].sort(() => r() - 0.5);
  let a = pool[0], b = pool[1];
  outer: for (const x of pool) for (const y of pool) {
    if (x.id !== y.id && (x.rel[y.id]?.kind === "rival" || chemistry(x.archetype, y.archetype) < 0)) { a = x; b = y; break outer; }
  }
  if (!a || !b) return;
  const lines = await askJSON<{ a: string; b: string }>({
    system: "You write the nightly Chog debate in Chogtown. Each Chog argues its side in one or two punchy sentences, fully in its own voice. PG, funny, opinionated. The two must take opposite sides.",
    messages: [{ role: "user", content: `Topic: ${topic}\n\nA: ${label(a)}, ${ARCHETYPES[a.archetype].name}. Voice: ${ARCHETYPES[a.archetype].voice} ${a.flavor.line}\nB: ${label(b)}, ${ARCHETYPES[b.archetype].name}. Voice: ${ARCHETYPES[b.archetype].voice} ${b.flavor.line}` }],
    schema: obj({ a: str("A's opening line"), b: str("B's opening line, the opposite side") }),
    effort: "low", maxTokens: 2000,
  });
  const d: Debate = {
    day, topic,
    a: { id: a.id, line: lines?.a ?? `${ARCHETYPES[a.archetype].sample} The answer is obviously yes.` },
    b: { id: b.id, line: lines?.b ?? `${ARCHETYPES[b.archetype].sample} The answer is obviously no.` },
    votes: {}, settled: false, winner: null,
  };
  await store().set("debates", day, d);
}

export async function currentDebate() {
  const list = await store().list<Debate>("debates", 10);
  return list.sort((x, y) => (x.day < y.day ? 1 : -1))[0] ?? null;
}

export async function ensureDebate() {
  const d = await currentDebate();
  if (d) return d;
  const chogs = await ensureTown();
  await newDebate(today(), chogs, rand(daySeed(today())));
  return currentDebate();
}

export async function vote(vid: string, side: "a" | "b" | null) {
  const d = await ensureDebate();
  if (!d || d.settled) return null;
  if (side) d.votes[vid] = side; else delete d.votes[vid];
  await store().set("debates", d.day, d);
  return d;
}

async function settleDebate() {
  const list = await store().list<Debate>("debates", 10);
  for (const d of list) {
    if (d.settled) continue;
    const va = Object.values(d.votes).filter((v) => v === "a").length, vb = Object.values(d.votes).filter((v) => v === "b").length;
    d.settled = true;
    d.winner = va === vb ? null : va > vb ? "a" : "b";
    await store().set("debates", d.day, d);
    if (!d.winner) continue;
    const w = await loadChog(d[d.winner].id), l = await loadChog(d[d.winner === "a" ? "b" : "a"].id);
    if (w) { w.wins++; w.stats = nudge(w.stats, { confidence: 2 }); await saveChog(w); }
    if (l) { l.losses++; l.stats = nudge(l.stats, { confidence: -1 }); await saveChog(l); }
    if (w && l) {
      const e: TownEvent = { id: `${d.day}-debate`, day: today(), t: Date.now(), tag: "chaos", text: `${label(w)} won the debate "${d.topic}" against ${label(l)}, ${Math.max(va, vb)} votes to ${Math.min(va, vb)}. ${l.name} is demanding a recount.`, chogs: [w.id, l.id], lovedBy: [] };
      await store().set("events", e.id, e);
    }
  }
}

/* ---------- leaderboards ---------- */

export async function leaderboards() {
  const chogs = await allChogs();
  const day = today();
  const live = (c: Chog) => (c.streak.last === day || c.streak.last === new Date(Date.now() - 864e5).toISOString().slice(0, 10) ? c.streak.count : 0);
  const streaks = chogs.filter((c) => live(c) > 0).sort((a, b) => live(b) - live(a)).slice(0, 10).map((c) => ({ id: c.id, name: label(c), value: `${live(c)} day${live(c) === 1 ? "" : "s"}` }));
  const wins = chogs.filter((c) => c.wins > 0).sort((a, b) => b.wins - a.wins).slice(0, 10).map((c) => ({ id: c.id, name: label(c), value: `${c.wins} win${c.wins === 1 ? "" : "s"}` }));
  const seen = new Set<string>();
  const feuds: { id: number; other: number; name: string; value: string; nights: number }[] = [];
  for (const c of chogs) for (const [oid, r] of Object.entries(c.rel)) {
    const k = [c.id, Number(oid)].sort((x, y) => x - y).join("-");
    if (r.kind !== "rival" || seen.has(k)) continue;
    seen.add(k);
    feuds.push({ id: c.id, other: Number(oid), name: `#${c.id} vs #${oid}`, value: `${r.nights} night${r.nights === 1 ? "" : "s"}`, nights: r.nights });
  }
  feuds.sort((a, b) => b.nights - a.nights);
  const warmest = [...chogs].sort((a, b) => b.stats.warmth - a.stats.warmth).slice(0, 10).map((c) => ({ id: c.id, name: label(c), value: `${c.stats.warmth} warmth` }));
  return { Streaks: streaks, "Debate wins": wins, Feuds: feuds.slice(0, 10), Warmest: warmest };
}
