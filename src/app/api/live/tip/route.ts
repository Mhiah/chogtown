import { json, fail, parseId } from "@/lib/api";
import { getSession } from "@/lib/session";
import { tip } from "@/live/island";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

/** After a viewer's wallet sends $CHOG to a Chog's holder: check the transfer on Monad and celebrate it. */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s?.address) return fail("Sign in with your wallet to tip in $CHOG.", 401);
  const b = await req.json().catch(() => ({}));
  const id = parseId(b.id);
  if (id === null || typeof b.hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(b.hash)) return fail("Missing the Chog or the transaction.");
  const r = await tip(s.address, id, b.hash as `0x${string}`);
  return r.ok ? json(r) : fail(r.error!);
}
