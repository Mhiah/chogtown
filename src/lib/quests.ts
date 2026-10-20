/**
 * Daily quests: three small goals a day for each visitor, paid in casino chips, plus a bonus for all three
 * and a streak for finishing them on consecutive days. Everyone gets the betting and slots quests; players
 * also get the scene ones.
 */
import { store } from "./store";
import { today, dayBefore } from "./config";
import { adjust } from "./casino";

export type QuestKey = "scenes" | "power" | "bet" | "spins" | "shout";
const POOL: Record<QuestKey, { title: string; need: number; play: boolean }> = {
  scenes: { title: "Play 2 cards on other Chogs", need: 2, play: true },
  power: { title: "Use one of your trait powers", need: 1, play: true },
  shout: { title: "Shout something to the town", need: 1, play: true },
  bet: { title: "Bet on a Main Event", need: 1, play: false },
  spins: { title: "Spin Chog Slots 3 times", need: 3, play: false },
};
export const QUEST_CHIPS = 150, ALL_DONE_BONUS = 300;

interface Quest { key: QuestKey; title: string; need: number; have: number; done: boolean }
interface Day { vid: string; day: string; quests: Quest[]; bonus: boolean; streak: number; lastDone: string | null }

const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/** Today's quests for a visitor. Players get two scene quests and one casino quest; watchers get casino ones. */
export async function quests(vid: string, canPlay: boolean, hasPowers = false) {
  const day = today();
  let d = await store().get<Day>("quests", vid);
  if (!d || d.day !== day) {
    const prev = d;
    const h = hash(vid + day);
    const play = (["scenes", hasPowers ? "power" : "shout"] as QuestKey[]);
    const casino = (h % 2 ? ["bet", "spins"] : ["spins", "bet"]) as QuestKey[];
    const keys: QuestKey[] = canPlay ? [...play, casino[0]] : ["spins", "bet"];
    d = {
      vid, day, bonus: false,
      quests: [...new Set(keys)].map((k) => ({ key: k, title: POOL[k].title, need: POOL[k].need, have: 0, done: false })),
      // the streak survives only if yesterday's quests were all done
      streak: prev && prev.lastDone === dayBefore(day) ? prev.streak : 0,
      lastDone: prev?.lastDone ?? null,
    };
    await store().set("quests", vid, d);
  }
  return d;
}

/** Something counted towards a quest happened. Pays out as quests complete. Returns what just got finished. */
export async function progress(vid: string | undefined, key: QuestKey, n = 1) {
  if (!vid) return null;
  const d = await store().get<Day>("quests", vid);
  if (!d || d.day !== today()) return null;
  const q = d.quests.find((x) => x.key === key && !x.done);
  if (!q) return null;
  q.have = Math.min(q.need, q.have + n);
  let paid = 0;
  if (q.have >= q.need) { q.done = true; paid += QUEST_CHIPS; }
  if (!d.bonus && d.quests.every((x) => x.done)) { d.bonus = true; paid += ALL_DONE_BONUS; d.streak += 1; d.lastDone = d.day; }
  await store().set("quests", vid, d);
  if (paid) await adjust(vid, paid).catch(() => null);
  return q.done ? { quest: q.title, paid, allDone: d.bonus } : null;
}
