/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Chog Island, live. One island runs on the server and every viewer watches the same one:
 * the life sim (src/live/sim.js), feuds that heat up stage by stage, players' intention cards turned into
 * AI-written scenes, and the Main Event: a feud settled in a seeded Rumble that every viewer sees in sync.
 */
import { createSim } from "./sim";
import { createRumble } from "@/arena/rumble";
import { store } from "@/lib/store";
import { ensureTown } from "@/lib/night";
import { type Chog, getChog, label, saveChog } from "@/lib/chogs";
import { fighter, recordFight, type Fighter } from "@/lib/arena";
import { ARCHETYPES } from "@/lib/personality";
import { askJSON, obj, str } from "@/lib/claude";
import { today } from "@/lib/config";
import type { TownEvent } from "@/lib/night";
import { adjust } from "@/lib/casino";
import { bump, seen } from "@/lib/stats";
import { POWERS, powersOf, isNight, type PowerKey } from "@/lib/powers";
import { client, ownerOf } from "@/lib/chain";
import { CHOG_TOKEN } from "@/lib/config";
import { decodeEventLog, formatUnits, getAddress, parseAbi } from "viem";

const V = 7; // bump to replace a running island in dev
const TICK_MS = 100;
const BELL_TO_FIGHT_MS = 40_000;   // the crowd walks over, the VS card shows, picks open
const AUTO_MAIN_EVERY_MS = 6 * 60_000;
const FIRST_MAIN_AFTER_MS = 2 * 60_000;

export const STAGES = [
  { at: 0, name: "Cordial" }, { at: 20, name: "Side-eye" }, { at: 45, name: "Beef" }, { at: 70, name: "Public feud" }, { at: 90, name: "Main Event" },
];
export const stageOf = (heat: number) => STAGES.reduce((s, x, i) => (heat >= x.at ? i : s), 0);

export const CARDS = {
  roast: { name: "Roast", emote: "🔥", heat: 24, brief: "roasts the other Chog to its face, in front of everyone" },
  rumour: { name: "Spread a rumour", emote: "🤫", heat: 4, brief: "whispers a juicy (made-up, PG) rumour about a third Chog, which the other Chog takes badly" },
  flirt: { name: "Flirt", emote: "💘", heat: -8, brief: "flirts, clumsily and charmingly" },
  makeup: { name: "Make up", emote: "🤝", heat: -25, brief: "tries to make up and end the beef" },
  challenge: { name: "Challenge", emote: "🥊", heat: 8, brief: "challenges the other Chog to settle it at the Main Event in the Amphitheatre" },
} as const;
export type CardKey = keyof typeof CARDS;
export type AnyCard = CardKey | PowerKey;
const metaOf = (k: AnyCard) => (k in POWERS ? POWERS[k as PowerKey] : CARDS[k as CardKey]);

interface Feud { a: number; b: number; heat: number; log: string[]; t: number }
interface Tips { id: number; total: number; count: number; last: { from: string; amount: number; t: number } | null }
interface Main {
  id: string; a: Fighter; b: Fighter; seed: number; why: string;
  bellAt: number; startAt: number; endAt: number;
  winner: "a" | "b"; result: Record<string, number | boolean>;
  picks: Record<string, "a" | "b">; done: boolean;
  house?: { a: number; b: number }; // chips the Candle Chogs pumped or dumped into the pool
  bets: Record<string, { side: "a" | "b"; amount: number; name: string }>;
}
type Send = (event: string, data: unknown) => void;

const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

function boot() {
  const st = {
    v: V, sim: null as any, chogs: new Map<number, Chog>(), feuds: new Map<string, Feud>(),
    main: null as Main | null, lastMain: null as Main | null, recent: [] as string[],
    crown: null as { id: number; name: string; since: number } | null, // Chog of the Day
    nextMain: Date.now() + FIRST_MAIN_AFTER_MS, nextNpcPower: Date.now() + 40_000,
    clients: new Set<Send>(), players: new Map<number, { vid: string; until: number; busy: boolean; cool: number }>(),
    tips: new Map<number, Tips>(), owners: new Map<number, { a: string | null; at: number }>(),
    seen: 0, changed: -1, lastSent: 0, timer: null as ReturnType<typeof setInterval> | null, ready: null as Promise<void> | null,
  };
  return st;
}
type Island = ReturnType<typeof boot>;
const G = globalThis as unknown as { __chogIsland?: Island };

export async function island(): Promise<Island> {
  if (G.__chogIsland && G.__chogIsland.v !== V) { if (G.__chogIsland.timer) clearInterval(G.__chogIsland.timer); G.__chogIsland = undefined; }
  const I = (G.__chogIsland ??= boot());
  I.ready ??= start(I);
  await I.ready;
  return I;
}

async function start(I: Island) {
  const chogs = await ensureTown();
  for (const c of chogs) I.chogs.set(c.id, c);
  const awake = new Set(chogs.map((c) => c.id));
  const cast = chogs.slice(0, 64).map((c) => ({
    id: c.id, name: c.name, archetype: c.archetype, image: c.image, owned: !!c.owner,
    rel: Object.fromEntries(Object.entries(c.rel).filter(([o, r]) => awake.has(Number(o)) && r.kind !== "neutral").map(([o, r]) => [o, r.kind])),
  }));
  I.sim = createSim(cast, { seed: Date.now() % 1e9 });
  for (const f of await store().list<Feud>("feuds", 300)) I.feuds.set(key(f.a, f.b), f);
  for (const t of await store().list<Tips>("tips", 2000)) I.tips.set(t.id, t);
  const crown = await store().get<{ id: number; name: string; since: number; day: string }>("town", "crown");
  if (crown && crown.day === today()) I.crown = crown;
  // seed the drama: rivals from past nights start with some heat
  for (const c of chogs) for (const [o, r] of Object.entries(c.rel)) {
    if (r.kind !== "rival" || !awake.has(Number(o))) continue;
    const k = key(c.id, Number(o));
    if (!I.feuds.has(k)) I.feuds.set(k, { a: Math.min(c.id, +o), b: Math.max(c.id, +o), heat: Math.min(60, 20 + r.nights * 8), log: ["Bad blood from the nightly gossip."], t: Date.now() });
  }
  I.timer = setInterval(() => { try { tick(I); } catch (e) { console.error("island tick", e); } }, TICK_MS);
}

/* ---------- the loop ---------- */

function tick(I: Island) {
  const sim = I.sim, now = Date.now();
  sim.step(TICK_MS / 1000);
  // rivals bumping into each other on their own warms their feud up a little
  for (; I.seen < sim.events.length; I.seen++) {
    const e = sim.events[I.seen];
    if (e.kind === "rival") heat(I, e.a, e.b, 3, null);
  }
  if (sim.events.length > 150) { sim.events.splice(0, 100); I.seen = Math.max(0, I.seen - 100); }
  // players who wandered off hand their Chog back to the sim
  for (const [id, p] of I.players) if (p.until < now && !p.busy) { sim.control(id, false); I.players.delete(id); }
  // the Main Event
  const m = I.main;
  if (m && !m.done && now >= m.bellAt && !sim.rally) sim.setRally(true);
  if (m && !m.done && now >= m.endAt) finishMain(I, m).catch((e) => console.error("main event", e));
  if (m?.done && now >= m.endAt + 25_000) { I.lastMain = m; I.main = null; sim.setRally(false); }
  if (!I.main && now >= I.nextMain) autoMain(I).catch((e) => console.error("auto main", e));
  if (now >= I.nextNpcPower) npcPower(I).catch((e) => console.error("npc power", e));
  // tell viewers: right away when something happens, else twice a second
  if (sim.changed !== I.changed || now - I.lastSent > 1000) { I.changed = sim.changed; I.lastSent = now; broadcast(I); }
}

export function view(I: Island) {
  const top = [...I.feuds.values()].filter((f) => f.heat >= 20).sort((a, b) => b.heat - a.heat).slice(0, 5)
    .map((f) => ({ a: f.a, b: f.b, an: I.chogs.get(f.a)?.name ?? `#${f.a}`, bn: I.chogs.get(f.b)?.name ?? `#${f.b}`, heat: Math.round(f.heat), stage: stageOf(f.heat) }));
  return { now: Date.now(), ...I.sim.snapshot(), feuds: top, main: mainView(I.main), lastMain: mainView(I.lastMain), players: [...I.players.keys()], crown: I.crown, night: isNight() };
}

function mainView(m: Main | null) {
  if (!m) return null;
  const n = { a: 0, b: 0 }; for (const s of Object.values(m.picks)) n[s]++;
  return { id: m.id, a: { ...m.a, tips: tipsOf(m.a.id) }, b: { ...m.b, tips: tipsOf(m.b.id) }, seed: m.seed, why: m.why, bellAt: m.bellAt, startAt: m.startAt, endAt: m.endAt, picks: n, pool: pools(m), done: m.done, winner: m.done ? m.winner : null };
}

function broadcast(I: Island) {
  if (!I.clients.size) return;
  const v = view(I);
  for (const send of I.clients) send("island", v);
}

export async function subscribe(send: Send, vid?: string) {
  const I = await island();
  seen(vid).catch(() => {}); bump("views").catch(() => {});
  I.clients.add(send);
  send("island", view(I));
  return () => I.clients.delete(send);
}

/* ---------- feuds ---------- */

function heat(I: Island, a: number, b: number, d: number, line: string | null) {
  if (a === b) return null;
  const k = key(a, b);
  const f = I.feuds.get(k) ?? { a: Math.min(a, b), b: Math.max(a, b), heat: 0, log: [], t: Date.now() };
  const before = stageOf(f.heat);
  f.heat = Math.max(0, Math.min(100, f.heat + d)); f.t = Date.now();
  if (line) f.log = [...f.log, line].slice(-6);
  I.feuds.set(k, f);
  store().set("feuds", k, f).catch(() => {});
  const after = stageOf(f.heat);
  if (after > before && after >= 2) gazette(`${name(I, a)} and ${name(I, b)} have gone from ${STAGES[before].name} to ${STAGES[after].name}. ${after >= 4 ? "Only the Amphitheatre can settle this now." : "The island is taking sides."}`, [a, b]);
  if (after >= 4 && !I.main) bookMain(I, a, b, "The feud boiled over.").catch(() => {});
  return { heat: f.heat, stage: after, before };
}
export const feudOf = (I: Island, a: number, b: number) => I.feuds.get(key(a, b)) ?? null;
const name = (I: Island, id: number) => { const c = I.chogs.get(id); return c ? label(c) : `Chog #${id}`; };

function gazette(text: string, chogs: number[], tag: TownEvent["tag"] = "feud") {
  const e: TownEvent = { id: `${today()}-live-${Date.now()}-${chogs.join("-")}`, day: today(), t: Date.now(), tag, text, chogs, lovedBy: [] };
  store().set("events", e.id, e).catch(() => {});
}

/* ---------- playing your Chog ---------- */

async function chogFor(I: Island, id: number) {
  let c = I.chogs.get(id);
  if (!c) { c = await getChog(id); I.chogs.set(id, c); }
  return c;
}

/** A player takes the wheel of their Chog (it walks out onto the island if it was inside). */
export async function join(vid: string, id: number) {
  const I = await island();
  const c = await chogFor(I, id);
  if (!I.sim.byId[id]) I.sim.add({ id, name: c.name, archetype: c.archetype, image: c.image, owned: !!c.owner, rel: {} });
  const p = I.players.get(id);
  if (p && p.vid !== vid && p.until > Date.now()) return { ok: false, error: `Someone else is playing ${c.name} right now.` };
  I.players.set(id, { vid, until: Date.now() + 5 * 60_000, busy: p?.busy ?? false, cool: p?.cool ?? 0 });
  seen(vid, true).catch(() => {});
  I.sim.control(id, true);
  return { ok: true };
}

function lease(I: Island, vid: string, id: number) {
  const p = I.players.get(id);
  if (!p || p.vid !== vid) return null;
  p.until = Date.now() + 5 * 60_000;
  return p;
}

export async function walk(vid: string, id: number, node: string) {
  const I = await island();
  const p = lease(I, vid, id) ?? ((await join(vid, id)).ok ? lease(I, vid, id) : null);
  if (!p) return { ok: false, error: "Join the island with your Chog first." };
  if (p.busy) return { ok: false, error: "Your Chog is in the middle of a scene." };
  return { ok: !!I.sim.send(id, node) };
}

type Line = { by: "a" | "b"; text: string };

// Shout: a player's own line, said out loud by their Chog. Short, no links, nothing rude.
const RUDE = /\b(f+u+c+k+|sh[i1]t+|b[i1]tch|c+u+n+t+|n[i1]gg|fag|retard(ed)?|kys|rape|porn|dick|pussy|whore|slut)\w*/gi;
export async function shout(vid: string, id: number, text: string) {
  const I = await island();
  const p = lease(I, vid, id) as (ReturnType<typeof lease> & { shoutAt?: number }) | null;
  if (!p) return { ok: false, error: "Bring your Chog onto the island first." };
  if (p.shoutAt && Date.now() - p.shoutAt < 8000) return { ok: false, error: "Give it a few seconds between shouts." };
  let t = text.replace(/https?:\/\/\S+|www\.\S+/gi, "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!t) return { ok: false, error: "Say something first." };
  t = t.replace(RUDE, (w) => w[0] + "*".repeat(Math.max(2, w.length - 1)));
  const c = I.sim.byId[id];
  if (!c?.out) return { ok: false, error: "Your Chog isn't out on the island." };
  c.bubble = { text: t, emote: "📣", t0: I.sim.t, until: I.sim.t + Math.max(4, Math.min(7, t.length / 12)) };
  p.shoutAt = Date.now();
  I.changed = -1;
  bump("shouts").catch(() => {});
  return { ok: true, text: t };
}

/** Play an intention card on another Chog: your Chog walks over, the AI writes the scene, the feud moves. */
/** holder: the player verified on Monad that they own this Chog; they can call rivals out from Side-eye. */
export async function play(vid: string, id: number, target: number, card: AnyCard, holder = false) {
  const I = await island();
  if (!(card in CARDS) && !(card in POWERS)) return { ok: false, error: "Unknown card." };
  const meta = metaOf(card);
  if (id === target) return { ok: false, error: "Pick another Chog." };
  const p = lease(I, vid, id) ?? ((await join(vid, id)).ok ? lease(I, vid, id) : null);
  if (!p) return { ok: false, error: "Join the island with your Chog first." };
  if (p.busy) return { ok: false, error: "Your Chog is already in a scene." };
  if (p.cool > Date.now()) return { ok: false, error: `Catch your breath: ${Math.ceil((p.cool - Date.now()) / 1000)}s.` };
  // trait powers: only Chogs minted with the right traits have them
  if (card in POWERS) {
    const me = await chogFor(I, id);
    if (!powersOf(me.traits).includes(card as PowerKey)) return { ok: false, error: `${me.name} needs ${POWERS[card as PowerKey].from} for that.` };
    if (card === "haunt" && !isNight()) return { ok: false, error: "Haunting only works at night (19:00–06:00 UTC)." };
    if (card === "pump" || card === "dump") return candle(I, me, target, card);
    if (card === "crown" && I.crown && I.crown.id !== target && I.crown.id !== id) return { ok: false, error: `${I.crown.name} wears the crown. Play it on ${I.crown.name} to take it.` };
    if (card === "crown" && I.crown?.id === id) return { ok: false, error: "You're already Chog of the Day." };
  }
  const tgt = I.sim.byId[target];
  if (!tgt?.out || tgt.leaving) return { ok: false, error: "That Chog just went inside." };
  // other players' Chogs are fair game, unless they're mid-scene
  if (tgt.player && (I.players.get(target)?.busy || tgt.talking)) return { ok: false, error: "They're busy in a scene. Try again in a moment." };
  if (I.sim.rally) return { ok: false, error: "Shh, the Main Event is on." };
  const sc = I.sim.scene(id, target, null, () => {
    p.busy = false;
    // haunted Chogs run home
    if (card === "haunt" && I.sim.byId[target]) { I.sim.byId[target].leaving = true; I.changed = -1; }
  });
  if (!sc) return { ok: false, error: "Couldn't get over there. Try again." };
  p.busy = true; p.cool = Date.now() + 8000;
  bump(`card_${card}`).catch(() => {}); bump("scenes").catch(() => {});

  const [a, b] = await Promise.all([chogFor(I, id), chogFor(I, target)]);
  const f = feudOf(I, id, target);
  const stage = stageOf(f?.heat ?? 0);
  // a rumour is about someone else on the island
  let about: Chog | null = null;
  if (card === "rumour") {
    const pool = I.sim.chogs.filter((c: { id: number; out: boolean }) => c.out && c.id !== id && c.id !== target);
    about = pool.length ? await chogFor(I, pick(pool as { id: number }[]).id) : null;
  }
  const accepted = card === "challenge" && stage >= (holder ? 1 : 2) && !I.main;
  const lines = await sceneLines(a, b, card, stage, f?.log ?? [], about, accepted);
  sc.lines = lines.map((l, i) => ({ ...l, emote: i === 0 ? meta.emote : "" }));

  // what it does to the story
  const summary = `${a.name} ${meta.name.toLowerCase()}${card === "rumour" && about ? ` about ${about.name}` : ""}: “${lines[0]?.text ?? ""}”`;
  const backfired = card === "prank" && Math.random() < .5;
  const d = card in CARDS ? CARDS[card as CardKey].heat : { zap: 20, crown: 10, frogdad: -100, haunt: 12, prank: backfired ? 15 : -10, pump: 0, dump: 0 }[card as PowerKey];
  const res = heat(I, id, target, d, summary);
  if (card in POWERS) powerEffects(I, a, b, card as PowerKey);
  if (card === "rumour" && about) heat(I, target, about.id, 15, `${a.name} told ${b.name} something about ${about.name}.`);
  if (card === "flirt" || card === "makeup") nudgeRel(a, b, +1);
  if (card === "roast") nudgeRel(a, b, -1);
  let booked = null;
  if (accepted) booked = await bookMain(I, id, target, `${a.name} called ${b.name} out, and ${b.name} said yes.`, 22_000);
  if (card === "roast" && (res?.stage ?? 0) >= 3) gazette(`${label(a)} roasted ${label(b)} in front of everyone: “${lines[0]?.text}”`, [id, target]);
  return { ok: true, lines, feud: res && { heat: Math.round(res.heat), stage: res.stage, name: STAGES[res.stage].name }, booked: !!booked, refused: card === "challenge" && !accepted };
}

/** What a trait power does to the town beyond the feud meter. */
function powerEffects(I: Island, a: Chog, b: Chog, card: PowerKey) {
  if (card === "zap") gazette(`${label(a)} zapped ${label(b)} with laser eyes ${isNight() ? "in the dark" : "in broad daylight"}. ${b.name} is still smoking.`, [a.id, b.id]);
  if (card === "frogdad") gazette(`Frog Dad arrived to end the feud between ${label(a)} and ${label(b)}. Nobody argues with Frog Dad.`, [a.id, b.id], "friends");
  if (card === "haunt") gazette(`${label(a)} haunted ${label(b)} after dark. ${b.name} ran home and won't come out.`, [a.id, b.id], "myst");
  if (card === "crown") {
    const from = I.crown?.id === b.id ? b.name : null;
    I.crown = { id: a.id, name: a.name, since: Date.now() };
    store().set("town", "crown", { ...I.crown, day: today() }).catch(() => {});
    I.changed = -1;
    gazette(from ? `${label(a)} snatched the crown off ${label(b)}. Chogtown has a new Chog of the Day.` : `${label(a)} claimed the crown. Chog of the Day, until somebody takes it.`, [a.id, b.id]);
  }
}

/**
 * Chogs use their trait powers on their own too, every minute or so, so the powers show up on screen
 * even when nobody is playing: laser eyes zap, clowns prank, crowns go after the crown, Skulls haunt at night,
 * frogs call Frog Dad on a hot feud.
 */
const NPC_POWER_EVERY_MS = 70_000;
async function npcPower(I: Island) {
  I.nextNpcPower = Date.now() + NPC_POWER_EVERY_MS * (.7 + Math.random() * .6);
  if (I.sim.rally || (I.main && !I.main.done)) return;
  type C = { id: number; out: boolean; leaving: boolean; walking: boolean; talking: boolean; player: boolean; hold: boolean; fade: number };
  const free = (I.sim.chogs as C[]).filter((c) => c.out && !c.leaving && !c.walking && !c.talking && !c.player && !c.hold && c.fade >= 1);
  if (free.length < 3) return;
  for (const c of [...free].sort(() => Math.random() - .5)) {
    const me = I.chogs.get(c.id); if (!me) continue;
    const hot = [...I.feuds.values()].find((f) => f.heat >= 30 && (f.a === c.id || f.b === c.id) && free.some((x) => x.id === (f.a === c.id ? f.b : f.a)));
    const crownFree = !I.crown || free.some((x) => x.id === I.crown!.id);
    const usable = powersOf(me.traits).filter((k) => k === "zap" || k === "prank" || (k === "haunt" && isNight()) || (k === "frogdad" && !!hot) || (k === "crown" && crownFree && I.crown?.id !== c.id));
    if (!usable.length) continue;
    const card = pick(usable);
    const targetId = card === "frogdad" ? (hot!.a === c.id ? hot!.b : hot!.a) : card === "crown" && I.crown ? I.crown.id : pick(free.filter((x) => x.id !== c.id)).id;
    const sc = I.sim.scene(c.id, targetId, null, () => {
      if (card === "haunt" && I.sim.byId[targetId]) { I.sim.byId[targetId].leaving = true; I.changed = -1; }
    });
    if (!sc) return;
    const b = await chogFor(I, targetId);
    const f = feudOf(I, c.id, targetId);
    const lines = await sceneLines(me, b, card, stageOf(f?.heat ?? 0), f?.log ?? [], null, false);
    sc.lines = lines.map((l, i) => ({ ...l, emote: i === 0 ? POWERS[card].emote : "" }));
    const d = { zap: 20, crown: 10, frogdad: -100, haunt: 12, prank: Math.random() < .5 ? 15 : -10, pump: 0, dump: 0 }[card];
    heat(I, c.id, targetId, d, `${me.name} used ${POWERS[card].name}: “${lines[0]?.text ?? ""}”`);
    powerEffects(I, me, b, card);
    bump("npc_powers").catch(() => {});
    return;
  }
}

function nudgeRel(a: Chog, b: Chog, d: number) {
  for (const [x, y] of [[a, b], [b, a]] as const) {
    const r = x.rel[y.id] ?? { score: 0, nights: 0, last: today(), kind: "neutral" as const };
    r.score = Math.max(-10, Math.min(10, r.score + d)); r.last = today();
    r.kind = r.score >= 2 ? "friend" : r.score <= -2 ? "rival" : "neutral";
    x.rel[y.id] = r;
  }
  Promise.all([saveChog(a), saveChog(b)]).catch(() => {});
}

async function sceneLines(a: Chog, b: Chog, card: AnyCard, stage: number, log: string[], about: Chog | null, accepted: boolean): Promise<Line[]> {
  const A = ARCHETYPES[a.archetype], B = ARCHETYPES[b.archetype];
  const situation = card === "challenge"
    ? accepted ? `${b.name} accepts. The Main Event is booked; they will fight in the Amphitheatre in front of the whole island.` : `${b.name} refuses: the beef isn't big enough yet (feud stage ${STAGES[stage].name}). ${b.name} brushes it off.`
    : card === "rumour" && about ? `The rumour is about ${about.name} (a ${ARCHETYPES[about.archetype].name}). ${b.name} is shocked and angry at ${about.name}.` : "";
  const out = await askJSON<{ lines: Line[] }>({
    system: "You write live scenes for Chogtown, a cosy, funny reality show where Chog NFTs live in a floating toy town. Two Chogs talk in speech bubbles. Each line is one short, punchy sentence (max 80 characters), fully in character, PG, specific and funny. No hashtags, no emojis, no narration: dialogue only.",
    messages: [{ role: "user", content: `Scene card: ${a.name} ${metaOf(card).brief}.\n${a.name} is a ${A.name}: ${A.voice}\n${b.name} is a ${B.name}: ${B.voice}\nTheir feud right now: ${STAGES[stage].name}.${log.length ? ` What happened before: ${log.slice(-3).join(" / ")}` : ""}\n${situation}\nWrite exactly 4 lines, alternating: ${a.name} (a), ${b.name} (b), ${a.name} (a), ${b.name} (b).` }],
    schema: obj({ lines: { type: "array", items: obj({ by: { type: "string", enum: ["a", "b"] }, text: str() }) } }),
    maxTokens: 600,
  }).catch(() => null);
  const ok = out?.lines?.filter((l) => l?.text && (l.by === "a" || l.by === "b")).slice(0, 4).map((l) => ({ by: l.by, text: l.text.slice(0, 110) }));
  if (ok && ok.length >= 2) return ok;
  return fallbackLines(a, b, card, about, accepted);
}

/** Green and Red Candle Chogs move the Main Event pool: no walk, just a shout from wherever they stand. */
async function candle(I: Island, me: Chog, target: number, card: "pump" | "dump") {
  const m = I.main;
  if (!m || m.done || Date.now() > m.startAt + 10_000) return { ok: false, error: `${POWERS[card].name} only works on a Main Event fighter while bets are open.` };
  if (target !== m.a.id && target !== m.b.id) return { ok: false, error: `Play ${POWERS[card].name} on one of the two Main Event fighters.` };
  const side: "a" | "b" = target === m.a.id ? "a" : "b", other = side === "a" ? "b" : "a";
  m.house ??= { a: 0, b: 0 };
  m.house[card === "pump" ? side : other] += 300;
  const f = side === "a" ? m.a : m.b;
  const c = I.sim.byId[me.id];
  if (c) { c.bubble = { text: card === "pump" ? `${f.name} TO THE MOON 🚀` : `${f.name}? Total rug. Dumping.`, emote: POWERS[card].emote, t0: I.sim.t, until: I.sim.t + 4 }; }
  I.changed = -1;
  bump(`card_${card}`).catch(() => {});
  return { ok: true, lines: [], pool: pools(m) };
}

function fallbackLines(a: Chog, b: Chog, card: AnyCard, about: Chog | null, accepted: boolean): Line[] {
  const L: Record<AnyCard, Line[]> = {
    zap: [{ by: "a", text: `Hold still, ${b.name}.` }, { by: "b", text: "Why are your eyes glowing?" }, { by: "a", text: "ZAP." }, { by: "b", text: "MY FUR. MY BEAUTIFUL FUR." }],
    crown: [{ by: "a", text: `That crown looks heavy, ${b.name}. Let me carry it.` }, { by: "b", text: "Don't you dare." }, { by: "a", text: "Too late. Bow to your Chog of the Day." }, { by: "b", text: "This town is a monarchy now?!" }],
    frogdad: [{ by: "a", text: "That's it. I'm calling Frog Dad." }, { by: "b", text: "You wouldn't." }, { by: "a", text: "FROG DAD!" }, { by: "b", text: "Okay okay, we're friends, we're friends!" }],
    haunt: [{ by: "a", text: `${b.name}… turn around…` }, { by: "b", text: "Who said that?!" }, { by: "a", text: "Ooooooooo." }, { by: "b", text: "I'M GOING HOME. I'M GOING HOME." }],
    prank: [{ by: "a", text: `${b.name}, smell this flower.` }, { by: "b", text: "Is it going to squirt me?" }, { by: "a", text: "Absolutely not. *honk*" }, { by: "b", text: "Every single time." }],
    pump: [], dump: [],
    roast: [{ by: "a", text: `${b.name}, your Rumble form is a tutorial.` }, { by: "b", text: "Say that again. Slower." }, { by: "a", text: "Your. Rumble. Form. Is. A. Tutorial." }, { by: "b", text: "Oh, it's ON." }],
    rumour: [{ by: "a", text: `Don't tell anyone, but ${about?.name ?? "someone"} has been talking about you.` }, { by: "b", text: "About ME? What did they say?!" }, { by: "a", text: "I couldn't possibly repeat it. It was mean." }, { by: "b", text: `${about?.name ?? "They"} is going to hear from me.` }],
    flirt: [{ by: "a", text: `${b.name}, did it get sunnier, or did you just walk up?` }, { by: "b", text: "That was terrible." }, { by: "a", text: "But you're smiling." }, { by: "b", text: "...Maybe a little." }],
    makeup: [{ by: "a", text: `${b.name}, can we stop this? I miss being normal.` }, { by: "b", text: "You started it." }, { by: "a", text: "I know. I'm sorry. Snacks on me." }, { by: "b", text: "Fine. Big snacks, though." }],
    challenge: accepted
      ? [{ by: "a", text: `${b.name}. Amphitheatre. Tonight. Everyone watches.` }, { by: "b", text: "Finally. I've been waiting for this." }, { by: "a", text: "Bring your whole kit." }, { by: "b", text: "Ring the bell." }]
      : [{ by: "a", text: `${b.name}, you and me. The Amphitheatre.` }, { by: "b", text: "Over what? We barely have beef." }, { by: "a", text: "Then I'll make some." }, { by: "b", text: "Come back when it's personal." }],
  };
  return L[card];
}

/* ---------- the Main Event ---------- */

// the Lucky Lilypad seeds each side of the book so the first bet always has odds
const HOUSE_SEED = 100;
function pools(m: Main) {
  const p = { a: HOUSE_SEED + (m.house?.a ?? 0), b: HOUSE_SEED + (m.house?.b ?? 0) };
  for (const x of Object.values(m.bets ?? {})) p[x.side] += x.amount;
  return p;
}

/** Bet play chips on a Main Event side. Winners split the whole pool. */
export async function betMain(vid: string, side: "a" | "b", amount: number, name: string) {
  const I = await island();
  const m = I.main;
  if (!m || m.done) return { ok: false, error: "No Main Event to bet on right now. The bell rings every few minutes." };
  if (Date.now() > m.startAt + 10_000) return { ok: false, error: "Betting closed once the fight got going." };
  const prev = m.bets[vid];
  if (prev && prev.side !== side) return { ok: false, error: `You already backed ${(prev.side === "a" ? m.a : m.b).name}. No switching sides.` };
  const left = await adjust(vid, -amount, name);
  if (left === null) return { ok: false, error: "Not enough chips. Spin the slots or come back tomorrow." };
  m.bets[vid] = { side, amount: (prev?.amount ?? 0) + amount, name };
  bump("bets").catch(() => {}); bump("chips_bet", amount).catch(() => {});
  m.picks[vid] = side;
  I.changed = -1; // tell viewers the odds moved
  return { ok: true, chips: left, bet: m.bets[vid], pool: pools(m) };
}

/** This viewer's bet on the current Main Event, if any. */
export async function myBet(vid: string) {
  const m = (await island()).main;
  const b = m && !m.done ? m.bets?.[vid] : null;
  return b ? { id: m!.id, side: b.side, amount: b.amount } : null;
}

async function settleBets(m: Main) {
  const p = pools(m), total = p.a + p.b, win = p[m.winner];
  let top: { name: string; paid: number } | null = null;
  for (const [vid, b] of Object.entries(m.bets)) {
    if (b.side !== m.winner) continue;
    const paid = Math.floor(b.amount * total / win);
    await adjust(vid, paid).catch(() => null);
    if (!top || paid > top.paid) top = { name: b.name, paid };
  }
  return top;
}

async function bookMain(I: Island, aId: number, bId: number, why: string, lead = BELL_TO_FIGHT_MS) {
  if (I.main) return null;
  const [a, b] = await Promise.all([chogFor(I, aId), chogFor(I, bId)]);
  const fa = fighter(a), fb = fighter(b);
  const seed = (Date.now() ^ (aId * 7919) ^ (bId * 104729)) >>> 0;
  // play it out now, headless: everyone will watch exactly this fight
  const g = createRumble({ me: fa, foe: fb, auto: true, seed });
  const result = g.run();
  const bellAt = Date.now() + 2000, startAt = bellAt + lead;
  const m: Main = {
    id: `${aId}-${bId}-${seed}`, a: fa, b: fb, seed, why, bellAt, startAt,
    endAt: startAt + Math.ceil(result.ticks / 60 * 1000) + 1500,
    winner: result.won ? "a" : "b", result, picks: {}, done: false, bets: {},
  };
  I.main = m;
  bump("main_events").catch(() => {});
  I.recent = [key(aId, bId), ...(I.recent ?? [])].slice(0, 4);
  I.nextMain = Date.now() + AUTO_MAIN_EVERY_MS;
  gazette(`MAIN EVENT: ${label(a)} vs ${label(b)} at the Royal Amphitheatre. ${why}`, [aId, bId]);
  return m;
}

/** No one booked one? The island's hottest feud gets the bell. */
async function autoMain(I: Island) {
  I.nextMain = Date.now() + AUTO_MAIN_EVERY_MS;
  const out = new Set(I.sim.chogs.filter((c: { out: boolean }) => c.out).map((c: { id: number }) => c.id));
  // the hottest feud that hasn't just been settled; if nothing's really hot, draw a grudge match
  I.recent ??= [];
  const hot = [...I.feuds.values()].filter((f) => f.heat >= 20 && I.chogs.has(f.a) && I.chogs.has(f.b) && !I.recent.includes(key(f.a, f.b)))
    .sort((x, y) => (y.heat + (out.has(y.a) ? 5 : 0)) - (x.heat + (out.has(x.a) ? 5 : 0)))[0];
  if (hot) return bookMain(I, hot.a, hot.b, `The island's hottest feud (${STAGES[stageOf(hot.heat)].name}).`);
  const ids = [...out] as number[];
  if (ids.length < 2) return null;
  let x = pick(ids), y = pick(ids.filter((z) => z !== x));
  for (let i = 0; i < 8 && I.recent.includes(key(x, y)); i++) { x = pick(ids); y = pick(ids.filter((z) => z !== x)); }
  return bookMain(I, x, y, "Grudge match drawn from the hat.");
}

async function finishMain(I: Island, m: Main) {
  if (m.done) return;
  m.done = true;
  const [a, b] = await Promise.all([chogFor(I, m.a.id), chogFor(I, m.b.id)]);
  const r = m.result as { won: boolean; myStocks: number; foeStocks: number; seconds: number; dealt: number };
  await recordFight(a, b, { won: r.won, myStocks: r.myStocks, foeStocks: r.foeStocks, seconds: r.seconds, dealt: r.dealt }).catch((e) => console.error("record main", e));
  const f = I.feuds.get(key(a.id, b.id));
  if (f) { f.heat = 10; f.log = [...f.log, `Settled at the Main Event: ${(r.won ? a : b).name} won.`].slice(-6); store().set("feuds", key(a.id, b.id), f).catch(() => {}); }
  const w = r.won ? a : b, l = r.won ? b : a;
  if (I.sim.byId[w.id]) I.sim.byId[w.id].bubble = { text: "WHO'S NEXT?!", emote: "🏆", t0: I.sim.t, until: I.sim.t + 5 };
  const top = await settleBets(m).catch((e) => { console.error("settle bets", e); return null; });
  if (top && top.paid >= 300) gazette(`${top.name} won ${top.paid.toLocaleString()} chips at the Lucky Lilypad backing ${w.name} in the Main Event.`, [w.id, l.id], "chaos");
  const callers = Object.values(m.picks).filter((s) => s === m.winner).length, total = Object.keys(m.picks).length;
  if (total) gazette(`${callers} of ${total} viewers called ${w.name}'s win over ${l.name} at the Main Event.`, [w.id, l.id], "chaos");
}

export async function pickSide(vid: string, side: "a" | "b") {
  const I = await island();
  const m = I.main;
  if (!m || m.done) return { ok: false, error: "No Main Event right now." };
  if (Date.now() > m.startAt + 10_000) return { ok: false, error: "Picks are closed." };
  m.picks[vid] = side;
  return { ok: true };
}

/** For demos and judges: ring the bell now on the hottest feud (needs CRON_SECRET). */
export async function ringNow() {
  const I = await island();
  if (I.main && !I.main.done) return { ok: false, error: "A Main Event is already on." };
  I.main = null; I.sim.setRally(false);
  await autoMain(I);
  return { ok: true };
}

/* ---------- $CHOG tips ---------- */

const TRANSFER = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
function tipsOf(id: number) { return Math.round(G.__chogIsland?.tips?.get(id)?.total ?? 0); }
export async function tipsFor(id: number) { const I = await island(); return I.tips.get(id) ?? { id, total: 0, count: 0, last: null }; }

/** The wallet that holds a Chog right now, cached for a few minutes. Tips go straight to it. */
export async function holderOf(id: number) {
  const I = await island();
  const hit = I.owners.get(id);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.a;
  const a = await ownerOf(id);
  I.owners.set(id, { a, at: Date.now() });
  return a;
}

/**
 * A viewer tipped a Chog's holder in $CHOG from their own wallet. We only read the chain: find the $CHOG
 * Transfer in that transaction from the viewer to the Chog's holder, then celebrate it on the island.
 */
export async function tip(from: string, id: number, hash: `0x${string}`) {
  const I = await island();
  if (await store().get("tiptx", hash)) return { ok: false, error: "That tip was already counted." };
  const to = await holderOf(id);
  if (!to) return { ok: false, error: "Couldn't find who holds that Chog on Monad." };
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 }).catch(() => null);
  if (!receipt || receipt.status !== "success") return { ok: false, error: "That transaction didn't go through." };
  let amount = 0;
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== getAddress(CHOG_TOKEN)) continue;
    try {
      const ev = decodeEventLog({ abi: TRANSFER, data: log.data, topics: log.topics });
      if (getAddress(ev.args.from) === getAddress(from) && getAddress(ev.args.to) === getAddress(to)) amount += Number(formatUnits(ev.args.value, 18));
    } catch { /* not a transfer */ }
  }
  if (amount <= 0) return { ok: false, error: "No $CHOG went from your wallet to that Chog's holder in this transaction." };
  await store().set("tiptx", hash, { hash, id, from, amount, t: Date.now() });
  bump("tips").catch(() => {}); bump("chog_tipped", Math.round(amount)).catch(() => {});
  const t = I.tips.get(id) ?? { id, total: 0, count: 0, last: null };
  t.total += amount; t.count++; t.last = { from: getAddress(from), amount, t: Date.now() };
  I.tips.set(id, t);
  await store().set("tips", String(id), t);
  const c = I.sim.byId[id];
  if (c?.out) { c.bubble = { text: `${Math.round(amount).toLocaleString()} $CHOG?! Thank you!!`, emote: "🪙", t0: I.sim.t, until: I.sim.t + 5 }; I.changed = -1; }
  gazette(`${name(I, id)} just got tipped ${Math.round(amount).toLocaleString()} $CHOG by a fan. That's ${Math.round(t.total).toLocaleString()} $CHOG in tips so far.`, [id], "friends");
  return { ok: true, amount, total: t.total };
}
