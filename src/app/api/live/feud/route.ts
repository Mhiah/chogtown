import { json, parseId } from "@/lib/api";
import { getSession } from "@/lib/session";
import { island, feudOf, stageOf, STAGES } from "@/live/island";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The feud between the Chog you play and another one: heat 0-100, its stage and what's happened so far. */
export async function GET(req: Request) {
  const s = await getSession();
  const b = parseId(new URL(req.url).searchParams.get("b") ?? undefined);
  const a = parseId(new URL(req.url).searchParams.get("a") ?? undefined) ?? s?.tokenId ?? null;
  if (a == null || b == null) return json({ heat: 0, stage: 0, name: STAGES[0].name, log: [] });
  const f = feudOf(await island(), a, b);
  const heat = Math.round(f?.heat ?? 0), stage = stageOf(heat);
  return json({ heat, stage, name: STAGES[stage].name, log: f?.log ?? [], next: STAGES[stage + 1] ?? null });
}
