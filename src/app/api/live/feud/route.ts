import { json, parseId } from "@/lib/api";
import { getSession } from "@/lib/session";
import { island, feudOf, stageOf, STAGES, tipsFor, holderOf, provenanceOf } from "@/live/island";
import { getChog } from "@/lib/chogs";
import { ARCHETYPES } from "@/lib/personality";
import { kitFor, kitLines } from "@/lib/kit";
import { powersOf } from "@/lib/powers";

/** How a Chog's NFT traits make it who it is: personality from its eyes and mouth, fight moves from its traits. */
async function dna(id: number) {
  const c = await getChog(id);
  const t = c.traits as Record<string, string>;
  const moves = kitLines(kitFor(id, c.traits)).slice(0, 3).map((l) => ({ ...l, trait: t[l.slot === "Head" ? "Head" : l.slot] ?? "" }));
  return { personality: ARCHETYPES[c.archetype].name, eyes: t.Eyes ?? "", mouth: t.Mouth ?? "", moves, powers: powersOf(c.traits), tier: t.Tier ?? "Common" };
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The feud between the Chog you play and another one: heat 0-100, its stage and what's happened so far. */
export async function GET(req: Request) {
  const s = await getSession();
  const b = parseId(new URL(req.url).searchParams.get("b") ?? undefined);
  const a = parseId(new URL(req.url).searchParams.get("a") ?? undefined) ?? s?.tokenId ?? null;
  // who holds Chog b and the $CHOG it has been tipped, so the card can offer a tip
  const extra = b == null ? {} : { owner: await holderOf(b).catch(() => null), tips: Math.round((await tipsFor(b)).total), dna: await dna(b).catch(() => null), prov: await provenanceOf(b).catch(() => null) };
  if (a == null || b == null) return json({ heat: 0, stage: 0, name: STAGES[0].name, log: [], ...extra });
  const f = feudOf(await island(), a, b);
  const heat = Math.round(f?.heat ?? 0), stage = stageOf(heat);
  return json({ heat, stage, name: STAGES[stage].name, log: f?.log ?? [], next: STAGES[stage + 1] ?? null, ...extra });
}
