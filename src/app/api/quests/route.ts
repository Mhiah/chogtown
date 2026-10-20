import { json, canPlay } from "@/lib/api";
import { getSession, setSession, newVid, type Session } from "@/lib/session";
import { quests, QUEST_CHIPS, ALL_DONE_BONUS } from "@/lib/quests";
import { powersOf } from "@/lib/powers";
import { getChog } from "@/lib/chogs";

export const dynamic = "force-dynamic";

/** Today's three quests for this visitor, with progress and the daily streak. */
export async function GET() {
  let s: Session | null = await getSession();
  if (!s) { s = { vid: newVid() }; await setSession(s); }
  const play = canPlay(s);
  const powers = play && s.tokenId ? powersOf((await getChog(s.tokenId)).traits).length > 0 : false;
  const d = await quests(s.vid, play, powers);
  return json({ quests: d.quests, bonus: d.bonus, streak: d.streak, reward: QUEST_CHIPS, allBonus: ALL_DONE_BONUS });
}
