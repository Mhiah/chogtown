/**
 * Trait powers: special cards a Chog only gets because of what it was minted with.
 * Laser eyes zap, crowns claim the town's crown, frogs call Frog Dad, Skulls haunt at night,
 * candles pump or dump a Main Event, clowns prank. The 1:1 Legendaries get every power.
 */
import type { Traits } from "./metadata";

export type PowerKey = "zap" | "crown" | "frogdad" | "haunt" | "pump" | "dump" | "prank";

export const POWERS: Record<PowerKey, { name: string; emote: string; from: string; what: string; brief: string }> = {
  zap: { name: "Zap", emote: "⚡", from: "laser eyes", what: "Laser-zap them. Stuns them and heats the feud up a lot.", brief: "zaps the other Chog with its laser eyes, leaving it frazzled and furious" },
  crown: { name: "Claim the Crown", emote: "👑", from: "a crown or royal robes", what: "Take the town's crown and become Chog of the Day.", brief: "claims the town's crown from the other Chog and declares itself Chog of the Day" },
  frogdad: { name: "Frog Dad", emote: "🐸", from: "a frog", what: "Frog Dad steps in and ends the feud. Back to Cordial.", brief: "calls Frog Dad, who arrives and scolds them both until they stop fighting" },
  haunt: { name: "Haunt", emote: "👻", from: "a Skull or Radioactive base", what: "Night only. Spook them so badly they run inside.", brief: "haunts the other Chog in the dark until it runs home screaming" },
  pump: { name: "Pump", emote: "🟢", from: "a Green Candle", what: "During a Main Event: pump their side of the betting pool.", brief: "pumps the other Chog's odds before the Main Event, hyping it up to the whole crowd" },
  dump: { name: "Dump", emote: "🔴", from: "a Red Candle", what: "During a Main Event: dump their side of the betting pool.", brief: "dumps on the other Chog's chances before the Main Event, spreading FUD to the crowd" },
  prank: { name: "Prank", emote: "🤡", from: "clown traits", what: "A clown prank. Either they laugh it off or it backfires badly.", brief: "pulls a clown prank on the other Chog" },
};

const has = (v: string | undefined, ...words: string[]) => !!v && words.some((w) => v.toLowerCase().includes(w));

/** Which powers a Chog's traits unlock. */
export function powersOf(traits: Traits): PowerKey[] {
  const t = traits as Record<string, string>;
  if (t.Base === "1:1" || t.Tier === "Legendary") return Object.keys(POWERS) as PowerKey[];
  const out: PowerKey[] = [];
  if (has(t.Eyes, "laser")) out.push("zap");
  if (t.Head === "Crown" || has(t.Head, "wreath", "thorn", "holy seal", "diamond") || t.Body === "Kings Robe") out.push("crown");
  if (t.Accessory === "Fwog" || t.Accessory === "PEPE" || t.Eyes === "Frog" || has(t.Body, "toad")) out.push("frogdad");
  if (t.Base === "Skull" || t.Base === "Radioactive" || t.Form === "Skull") out.push("haunt");
  if (t.Accessory === "Green Candle") out.push("pump");
  if (t.Accessory === "Red Candle") out.push("dump");
  if (has(t.Eyes, "clown") || has(t.Mouth, "clown") || t.Head === "Clown Nose") out.push("prank");
  return out;
}

/** Night on the island, in UTC: the town is dark 19:00–05:59. */
export const isNight = (d = new Date()) => { const h = d.getUTCHours(); return h >= 19 || h < 6; };
