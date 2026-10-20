import { json } from "@/lib/api";
import { ensureTown } from "@/lib/night";

export const dynamic = "force-dynamic";

/** Everyone awake on the island, with who they love and hate, for the live sim. */
export async function GET() {
  const chogs = await ensureTown();
  const awake = new Set(chogs.map((c) => c.id));
  return json({
    cast: chogs.slice(0, 64).map((c) => ({
      id: c.id, name: c.name, archetype: c.archetype, image: c.image, owned: !!c.owner,
      rel: Object.fromEntries(Object.entries(c.rel).filter(([o, r]) => awake.has(Number(o)) && r.kind !== "neutral").map(([o, r]) => [o, r.kind])),
    })),
  });
}
