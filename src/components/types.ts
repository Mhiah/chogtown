export type PlaceKey = "home" | "arena" | "feed" | "hall" | "shop";
export const PLACES: { key: PlaceKey; name: string; eyebrow: string; dock: string }[] = [
  { key: "home", name: "Your Chogmate", eyebrow: "The heart of Chogtown", dock: "Chogmate" },
  { key: "arena", name: "The Royal Amphitheatre", eyebrow: "Games", dock: "Arena" },
  { key: "feed", name: "The Grand Gazette", eyebrow: "Town feed", dock: "Gazette" },
  { key: "hall", name: "Palace of Legends", eyebrow: "Leaderboards", dock: "Legends" },
  { key: "shop", name: "The Boutique Quarter", eyebrow: "Face Booth & studio", dock: "Boutique" },
];

export interface Me { address: string | null; tokenId: number | null; guest: boolean; held: { balance: number; ids: number[] | null } | null; ai: boolean }
export type Stats = Record<"warmth" | "confidence" | "chaos" | "trust" | "curiosity", number>;
export interface ChogView {
  id: number; name: string; nftName: string; image: string | null; traits: Record<string, string>; real: boolean;
  archetype: string; archetypeKey: string; flavor: string; flavorLine: string; district: string; backstory: string;
  stats: Stats; delta: Stats; mood: string;
  streak: { count: number; best: number; last: string | null; days: string[] };
  wins: number; losses: number; look: { hat: string; aura: string };
  relations: { id: number; score: number; nights: number; kind: "friend" | "rival" | "neutral" }[];
  moments: { day: string; text: string }[]; report: { day: string; text: string; with: number } | null; sample: string;
}

export interface Shell {
  me: Me | null;
  refreshMe(): Promise<void>;
  chog: ChogView | null;
  setChog(c: ChogView | null): void;
  toast(t: string): void;
  bounce(): void;
  setLook(l: { hat?: string; aura?: string }): void;
}
