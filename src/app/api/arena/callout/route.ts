import { json, fail, parseId } from "@/lib/api";
import { getChog } from "@/lib/chogs";
import { fighter } from "@/lib/arena";
import { CHOG_SUPPLY } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Call out any of the 1,969 Chogs by number. */
export async function POST(req: Request) {
  const { tokenId } = await req.json().catch(() => ({}));
  const id = parseId(tokenId);
  if (!id || id > CHOG_SUPPLY) return fail("Pick a Chog from 1 to 1969.");
  return json({ foe: fighter(await getChog(id, { resident: true })) });
}
