import { getAddress } from "viem";
import { json } from "@/lib/api";
import { getSession } from "@/lib/session";
import { chogsOf } from "@/lib/chain";
import { hasAI } from "@/lib/config";
import { perksOf } from "@/lib/perks";

export const dynamic = "force-dynamic";

/** Who is visiting, which Chog they are playing as, and which Chogs their wallet holds. */
export async function GET() {
  const s = await getSession();
  let held: { balance: number; ids: number[] | null } | null = null;
  if (s?.address) held = await chogsOf(getAddress(s.address)).catch(() => null);
  const perks = await perksOf(s?.address);
  // a holder is playing their own Chog (verified on Monad when they picked it)
  const holder = !!s?.address && !s.guest && !!s.tokenId;
  return json({ address: s?.address ?? null, tokenId: s?.tokenId ?? null, guest: !!s?.guest, held, ai: hasAI(), perks, holder });
}
