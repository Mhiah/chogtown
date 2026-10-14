import { json } from "@/lib/api";
import { getSession } from "@/lib/session";
import { store } from "@/lib/store";
import { ensureTown, feed, runNight } from "@/lib/night";
import { dayBefore, today } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The Gazette: last night's gossip, plus how many Chogs live in town. */
export async function GET() {
  let chogs;
  try {
    chogs = await ensureTown();
    const meta = await store().get<{ day: string }>("meta", "night");
    // The nightly cron normally runs this. If the town has never had a night, or the cron missed one, run it now.
    if (!meta || meta.day < dayBefore(today())) await runNight({ maxPairs: meta ? 10 : 4 });
  } catch (e) {
    console.error("Town failed to load:", e);
    return json({ error: `The town couldn't load: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
  const s = await getSession();
  const events = await feed();
  return json({
    population: chogs.length,
    events: events.map((e) => ({ id: e.id, day: e.day, t: e.t, tag: e.tag, text: e.text, chogs: e.chogs, loves: e.lovedBy.length, loved: !!s && e.lovedBy.includes(s.vid) })),
  });
}
