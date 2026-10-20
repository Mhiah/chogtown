import { json } from "@/lib/api";
import { getSession, setSession, newVid } from "@/lib/session";
import { RESIDENT_IDS, CHOG_SUPPLY } from "@/lib/config";
import { getChog } from "@/lib/chogs";

export const dynamic = "force-dynamic";

/** Explore Chogtown as any Chog. Chats and exhibition fights work, but only real owners shape a Chog or keep a streak. */
export async function POST(req: Request) {
  const prev = await getSession();
  const body = await req.json().catch(() => ({}));
  const want = Number(body?.tokenId);
  const tokenId = Number.isInteger(want) && want >= 1 && want <= CHOG_SUPPLY ? want : RESIDENT_IDS[0];
  await getChog(tokenId, { resident: true });
  // guests visit to watch; a judge pass carries over so judges can play whichever Chog they pick
  await setSession({ guest: true, tokenId, vid: prev?.vid ?? newVid(), ...(prev?.judge ? { judge: true } : {}) });
  return json({ tokenId });
}
