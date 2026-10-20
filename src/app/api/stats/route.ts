import { json } from "@/lib/api";
import { stats } from "@/lib/stats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Public usage numbers: visitors, players, scenes, Main Events, bets, spins and tips, today and all-time. */
export async function GET() {
  return json(await stats());
}
