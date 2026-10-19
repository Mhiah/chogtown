import { parseId } from "@/lib/api";
import { getChog } from "@/lib/chogs";
import { artUrl, fetchIpfs } from "@/lib/metadata";

/** Serves the NFT image from our own origin so the studio can draw it onto a canvas and download it. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = parseId(params.id);
  if (id === null) return new Response("Not found", { status: 404 });
  const local = artUrl(id);
  if (local) return Response.redirect(new URL(local, req.url), 308);
  const c = await getChog(id);
  if (!c.image) return new Response("No image", { status: 404 });
  try {
    const r = await fetchIpfs(c.image, 10000);
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !type.startsWith("image/")) return new Response("No image", { status: 502 });
    return new Response(r.body, { headers: { "content-type": type, "cache-control": "public, max-age=604800, immutable" } });
  } catch {
    return new Response("No image", { status: 502 });
  }
}
