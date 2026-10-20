import { json, parseId } from "@/lib/api";
import { getSession } from "@/lib/session";
import { island, feudOf, stageOf, STAGES, tipsFor, holderOf } from "@/live/island";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The feud between the Chog you play and another one: heat 0-100, its stage and what's happened so far. */
export async function GET(req: Request) {
  const s = await getSession();
  const b = parseId(new URL(req.url).searchParams.get("b") ?? undefined);
  const a = parseId(new URL(req.url).searchParams.get("a") ?? undefined) ?? s?.tokenId ?? null;
  // who holds Chog b and the $CHOG it has been tipped, so the card can offer a tip
  const extra = b == null ? {} : { owner: await holderOf(b).catch(() => null), tips: Math.round((await tipsFor(b)).total) };
  if (a == null || b == null) return json({ heat: 0, stage: 0, name: STAGES[0].name, log: [], ...extra });
  const f = feudOf(await island(), a, b);
  const heat = Math.round(f?.heat ?? 0), stage = stageOf(heat);
  return json({ heat, stage, name: STAGES[stage].name, log: f?.log ?? [], next: STAGES[stage + 1] ?? null, ...extra });
}
