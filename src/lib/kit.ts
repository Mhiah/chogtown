/**
 * Rumble movesets. Every Chog's fighting kit comes straight from its on-chain traits:
 * Eyes are the attack, Mouth is the special, Head is the dash, Body and Aura are passives,
 * the Accessory is a trick. Pure functions, shared by the arena (client) and the server.
 */
import type { Traits } from "./metadata";

export type EyesKind = "laser" | "tears" | "hearts" | "bolts" | "stare" | "spit";
export type MouthKind = "puke" | "bubble" | "drool" | "coins" | "honk" | "chomp" | "wail" | "grin";
export type DashKind = "gore" | "quick" | "anchor" | "slide" | "double" | "roll";
export type AuraKind = "burn" | "wind" | "smoke" | "regen" | "heavy" | "leech" | "zap" | "focus" | "none";
export type AccKind = "knife" | "frog" | "pump" | "dump" | "lucky" | "none";
export type BodyPerk = "duck" | "banana" | "astro" | "shark" | "armor" | "escape" | "none";

export interface Kit {
  eyes: { kind: EyesKind; name: string; color: string };
  mouth: { kind: MouthKind; name: string };
  dash: { kind: DashKind; name: string };
  body: { perk: BodyPerk; name: string; mass: number; speed: number };
  aura: { kind: AuraKind; name: string; color: string };
  acc: { kind: AccKind; name: string };
  power: number;
  skin: string;
  /** which way the art faces, so the portrait can flip as the fighter turns */
  faces: 1 | -1;
}

const has = (v: string | undefined, ...w: string[]) => !!v && w.some((x) => v.toLowerCase().includes(x));
const hash = (n: number, k = 1) => { let x = Math.imul(n + 7, 2654435761) ^ Math.imul(k, 40503); x ^= x >>> 13; return ((x >>> 0) % 1000) / 1000; };

function eyes(v = ""): Kit["eyes"] {
  const e = v.toLowerCase();
  if (e.includes("laser") || e.includes("plasma") || e.includes("viper")) {
    const color = e.includes("fire") ? "#ff7a2b" : e.includes("green") ? "#5dff94" : e.includes("cyan") || e.includes("plasma") ? "#59e6ff" : "#b06bff";
    return { kind: "laser", name: `${v} beam`, color };
  }
  if (has(e, "cry", "tear", "teary")) return { kind: "tears", name: `${v} tear spray`, color: "#8fd8ff" };
  if (has(e, "heart", "happy")) return { kind: "hearts", name: `${v} homing hearts`, color: "#ff7fb6" };
  if (has(e, "glass", "visor", "vr", "anime", "3d")) return { kind: "bolts", name: `${v} double shot`, color: "#ffe27a" };
  if (has(e, "dead", "xd", "retard", "tired", "flat", "base", "vertical", "up")) return { kind: "stare", name: `${v} death stare`, color: "#d9c8ff" };
  return { kind: "spit", name: `${v || "Plain"} spitball`, color: "#f7f1ff" };
}

function mouth(v = ""): Kit["mouth"] {
  const m = v.toLowerCase();
  if (m.includes("puke")) return { kind: "puke", name: "Rainbow puke" };
  if (m.includes("bubble")) return { kind: "bubble", name: "Bubblegum shield" };
  if (m.includes("drool")) return { kind: "drool", name: "Drool slick" };
  if (has(m, "gold tooth", "coin")) return { kind: "coins", name: `${v} spit` };
  if (m.includes("clown")) return { kind: "honk", name: "Clown HONK" };
  if (has(m, "lip bite", "grit")) return { kind: "chomp", name: `${v} chomp` };
  if (has(m, "sad", "worried", "wo")) return { kind: "wail", name: `${v} wail` };
  return { kind: "grin", name: `${v || "Big"} grin (heal)` };
}

const SPIKE = ["crown", "horn", "thorn", "wizard", "spartan", "banana"];
function dash(v = ""): Kit["dash"] {
  const h = v.toLowerCase();
  if (SPIKE.some((w) => h.includes(w))) return { kind: "gore", name: `${v} gore` };
  if (h.includes("bucket")) return { kind: "anchor", name: `${v} anchor` };
  if (h.includes("beanie")) return { kind: "slide", name: `${v} slide` };
  if (has(h, "band", "bandana", "wreath", "seal")) return { kind: "double", name: `${v} double dash` };
  if (has(h, "cap", "hat", "neet", "mcga", "helmet")) return { kind: "quick", name: `${v} shoulder dash` };
  return { kind: "roll", name: `${v && v !== "None" ? v : "Bare head"} dodge roll` };
}

function body(v = "", id: number): Kit["body"] {
  const b = v.toLowerCase();
  const j = (hash(id, 3) - 0.5) * 0.12;
  if (b.includes("duck")) return { perk: "duck", name: "Duck Float: survives one ring-out", mass: 1 + j, speed: 1 };
  if (b.includes("banana")) return { perk: "banana", name: "Banana suit: dashes drop peels", mass: 1 + j, speed: 1.02 };
  if (b.includes("astro") || b.includes("sci fi")) return { perk: "astro", name: `${v}: floaty, recovers from edges`, mass: 0.88, speed: 1.08 };
  if (b.includes("shark") || b.includes("dragon")) return { perk: "shark", name: `${v}: fast`, mass: 0.96, speed: 1.16 };
  if (has(b, "armor", "robe", "spartan", "guard")) return { perk: "armor", name: `${v}: heavy, hard to launch`, mass: 1.3, speed: 0.92 };
  if (has(b, "inmate", "prisoner", "robber", "stripes")) return { perk: "escape", name: `${v}: dash recharges fast`, mass: 0.98, speed: 1.04 };
  return { perk: "none", name: v || "Plain", mass: 1 + j, speed: 1 - j / 2 };
}

function aura(v = ""): Kit["aura"] {
  const a = v.toLowerCase();
  if (!a) return { kind: "none", name: "No aura", color: "#f4ce87" };
  if (has(a, "burn", "fier", "fire")) return { kind: "burn", name: `${v}: hits burn`, color: "#ff8a3d" };
  if (a.includes("wind")) return { kind: "wind", name: `${v}: faster`, color: "#c9f3ff" };
  if (a.includes("smoke") || a.includes("mist")) return { kind: "smoke", name: `${v}: sometimes phases through shots`, color: "#b9b2c9" };
  if (has(a, "aqua", "cool", "mint", "clean", "green", "white")) return { kind: "regen", name: `${v}: heals over time`, color: "#7ff0d0" };
  if (has(a, "royal", "purple", "violet")) return { kind: "heavy", name: `${v}: heavier`, color: "#a77bff" };
  if (has(a, "rose")) return { kind: "leech", name: `${v}: hits heal you`, color: "#ff9bcb" };
  if (a.includes("electric")) return { kind: "zap", name: `${v}: dash stuns`, color: "#fff27a" };
  if (a.includes("yellow")) return { kind: "focus", name: `${v}: special recharges faster`, color: "#ffe066" };
  return { kind: "none", name: v, color: "#f4ce87" };
}

function acc(v = ""): Kit["acc"] {
  const a = v.toLowerCase();
  if (a.includes("knife")) return { kind: "knife", name: "Knife: close attacks slash" };
  if (a.includes("fwog") || a.includes("pepe")) return { kind: "frog", name: `${v}: frog dad jumps in once per life` };
  if (a.includes("green candle")) return { kind: "pump", name: "Green candle: stronger when ahead" };
  if (a.includes("red candle")) return { kind: "dump", name: "Red candle: stronger when behind" };
  if (a) return { kind: "lucky", name: `${v}: lucky crits` };
  return { kind: "none", name: "" };
}

const SKIN: Record<string, string> = {
  pink: "#f4a6c8", origin: "#f1e2c6", red: "#e2626a", black: "#3d3546", yellow: "#f6d55c", blue: "#7aa8ff", white: "#f6f4f8",
  green: "#86d99a", jade: "#4fb59a", purple: "#9d7dff", "multi colored": "#ff9bcb", beige: "#e6d2ae", metal: "#b8c0cc", grey: "#9c9aa8",
};
const TIER_POWER: Record<string, number> = { Common: 1, Uncommon: 1.03, Rare: 1.07, Epic: 1.11, Legendary: 1.16 };

export function kitFor(id: number, t: Traits): Kit {
  // The ten 1:1 Legendaries have hand-drawn art and almost no traits: give them a signature kit.
  if (t.Base === "1:1") return {
    eyes: { kind: "laser", name: "Legendary fire beam", color: "#ff7a2b" }, mouth: { kind: "puke", name: "Rainbow puke" },
    dash: { kind: "gore", name: "Legendary gore" }, body: { perk: "armor", name: "1:1 Legendary: heavy", mass: 1.25, speed: 1.02 },
    aura: { kind: "burn", name: "Legendary aura: hits burn", color: "#ff8a3d" }, acc: { kind: "lucky", name: "Legendary luck: crits" },
    power: 1.16, skin: "#ffd45c", faces: 1,
  };
  const bd = body(t.Body, id);
  const au = aura(t.Aura);
  if (au.kind === "heavy") bd.mass *= 1.12;
  return {
    eyes: eyes(t.Eyes), mouth: mouth(t.Mouth), dash: dash(t.Head), body: bd, aura: au, acc: acc(t.Accessory),
    power: (TIER_POWER[t.Tier] ?? 1) * (t.Base === "1:1" ? 1.06 : 1),
    skin: SKIN[(t.Skin || "origin").toLowerCase()] ?? "#f1e2c6",
    faces: t.Side === "Left" ? -1 : 1,
  };
}

/** One line per slot, for the fight card. */
export function kitLines(k: Kit) {
  return [
    { slot: "Eyes", what: k.eyes.name },
    { slot: "Mouth", what: k.mouth.name },
    { slot: "Head", what: k.dash.name },
    { slot: "Body", what: k.body.name },
    ...(k.aura.kind !== "none" ? [{ slot: "Aura", what: k.aura.name }] : []),
    ...(k.acc.kind !== "none" ? [{ slot: "Accessory", what: k.acc.name }] : []),
  ];
}
