import { json, fail, parseId, canPlay } from "@/lib/api";
import { getSession } from "@/lib/session";
import { agendaOf, setAgenda, AGENDAS, type Agenda } from "@/live/island";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** A Chog's agenda for today and its diary ("while you were away"). */
export async function GET(req: Request) {
  const s = await getSession();
  const id = parseId(new URL(req.url).searchParams.get("id") ?? undefined) ?? s?.tokenId ?? null;
  if (id === null) return fail("Which Chog?");
  return json({ ...(await agendaOf(id)), options: AGENDAS });
}

/** The holder sets what their Chog does today while they're away. */
export async function POST(req: Request) {
  const s = await getSession();
  if (!canPlay(s) || !s?.tokenId) return fail("Only the Chog's holder can set its agenda.", 403);
  const { mode } = await req.json().catch(() => ({}));
  if (!(mode in AGENDAS)) return fail("Pick an agenda.");
  const r = await setAgenda(s.tokenId, mode as Agenda);
  return r.ok ? json(r) : fail(r.error!);
}
