/**
 * Usage numbers for the submission and for us: who came, who played, what happened. Counted in memory and
 * written to the store every half minute, per UTC day and all-time.
 */
import { store } from "./store";
import { today } from "./config";

type Counts = Record<string, number>;
interface Day { day: string; counts: Counts; visitors: string[]; players: string[] }

const G = globalThis as unknown as { __chogStats?: { day: Day | null; all: Counts | null; dirty: boolean; timer: ReturnType<typeof setInterval> | null } };
const S = (G.__chogStats ??= { day: null, all: null, dirty: false, timer: null });

async function load() {
  const d = today();
  if (!S.day || S.day.day !== d) S.day = (await store().get<Day>("stats", d)) ?? { day: d, counts: {}, visitors: [], players: [] };
  if (!S.all) S.all = (await store().get<Counts>("stats", "all")) ?? {};
  S.timer ??= setInterval(flush, 30_000);
}

async function flush() {
  if (!S.dirty || !S.day || !S.all) return;
  S.dirty = false;
  await Promise.all([store().set("stats", S.day.day, S.day), store().set("stats", "all", S.all)]).catch(() => { S.dirty = true; });
}

/** Count something that happened (a scene, a bet, a spin…). */
export async function bump(key: string, n = 1) {
  await load().catch(() => {});
  if (!S.day || !S.all) return;
  S.day.counts[key] = (S.day.counts[key] ?? 0) + n;
  S.all[key] = (S.all[key] ?? 0) + n;
  S.dirty = true;
}

/** Remember a visitor (and whether they played), once per day. */
export async function seen(vid: string | undefined, played = false) {
  if (!vid) return;
  await load().catch(() => {});
  if (!S.day || !S.all) return;
  const list = played ? S.day.players : S.day.visitors;
  if (list.includes(vid)) return;
  list.push(vid);
  S.all[played ? "players" : "visitors"] = (S.all[played ? "players" : "visitors"] ?? 0) + 1;
  S.dirty = true;
}

export async function stats() {
  await load();
  const days = (await store().list<Day>("stats", 60)).filter((d) => d && "day" in d).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 7);
  return {
    allTime: S.all,
    today: { ...S.day!.counts, visitors: S.day!.visitors.length, players: S.day!.players.length },
    days: days.map((d) => ({ day: d.day, visitors: d.visitors.length, players: d.players.length, ...d.counts })),
  };
}
