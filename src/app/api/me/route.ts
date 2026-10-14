import { getAddress } from "viem";
import { json } from "@/lib/api";
import { getSession } from "@/lib/session";
import { chogsOf } from "@/lib/chain";
import { hasAI } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Who is visiting, which Chog they are playing as, and which Chogs their wallet holds. */
export async function GET() {
  const s = await getSession();
  let held: { balance: number; ids: number[] | null } | null = null;
  if (s?.address) held = await chogsOf(getAddress(s.address)).catch(() => null);
  return json({ address: s?.address ?? null, tokenId: s?.tokenId ?? null, guest: !!s?.guest, held, ai: hasAI() });
}
