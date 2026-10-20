import { NextResponse } from "next/server";
import { getSession, setSession, newVid } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The judge pass. Most judges won't hold a Chog, so organizers get a private link
 * (/api/judge?code=…, code in JUDGE_CODE) that lets them play any Chog like a holder.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = process.env.JUDGE_CODE;
  // relative redirects, so it works behind Railway's proxy
  const to = (where: string) => new NextResponse(null, { status: 307, headers: { Location: where } });
  if (!code || url.searchParams.get("code") !== code) return to("/?judge=invalid");
  const prev = await getSession();
  await setSession({ ...(prev ?? {}), vid: prev?.vid ?? newVid(), judge: true });
  return to("/?judge=1");
}
