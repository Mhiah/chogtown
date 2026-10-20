/** Face Booth scores. A Chog keeps its best; the day's top score makes the Gazette. */
import { store } from "./store";
import { today } from "./config";
import { type Chog, allChogs, saveChog, label } from "./chogs";
import type { TownEvent } from "./night";

export interface BoothRecord { best: number; runs: number; day: string; todayBest: number }
type WithBooth = Chog & { booth?: BoothRecord };

export const boothRecord = (c: WithBooth): BoothRecord => {
  const r = c.booth ?? { best: 0, runs: 0, day: "", todayBest: 0 };
  if (r.day !== today()) { r.day = today(); r.todayBest = 0; }
  return r;
};

/** Saves a run. Returns the Chog's record and its place on today's board. */
export async function saveRun(c: WithBooth, score: number) {
  const r = boothRecord(c);
  const prevBest = r.best;
  r.runs++; r.best = Math.max(r.best, score); r.todayBest = Math.max(r.todayBest, score);
  c.booth = r;
  const pb = score > prevBest;
  if (pb && score >= 300) c.moments = [...c.moments, { day: today(), text: `New Face Booth best: ${score}.` }].slice(-20);
  await saveChog(c);
  const town = (await allChogs()) as WithBooth[];
  const todays = town.map((x) => boothRecord(x).todayBest).filter((s) => s > 0).sort((a, b) => b - a);
  const rank = todays.indexOf(r.todayBest) + 1 || todays.length;
  // only a run that is this Chog's best today can take the headline
  if (rank === 1 && score === r.todayBest && score >= 200) {
    const e: TownEvent = { id: `${today()}-booth-top`, day: today(), t: Date.now(), tag: "chaos", text: `${label(c)} took over the Face Booth with ${score} points. Witnesses say the faces involved were "a lot".`, chogs: [c.id], lovedBy: [] };
    await store().set("events", e.id, e);
  }
  return { record: r, pb, rank, of: todays.length };
}

export async function boothBoard() {
  const town = (await allChogs()) as WithBooth[];
  return town.filter((c) => (c.booth?.best ?? 0) > 0).sort((a, b) => b.booth!.best - a.booth!.best).slice(0, 10).map((c) => ({ id: c.id, name: label(c), value: `${c.booth!.best}` }));
}
