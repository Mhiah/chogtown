import { subscribe } from "@/live/island";
import { getSession, setSession, newVid } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The live island as a server-sent event stream: one "island" snapshot whenever something happens, at least once a second. */
export async function GET(req: Request) {
  const enc = new TextEncoder();
  // every viewer gets a session id, so the usage numbers count unique visitors
  let sess = await getSession();
  if (!sess) { sess = { vid: newVid() }; await setSession(sess); }
  const vid = sess.vid;
  let stop: (() => void) | null = null, ping: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream({
    async start(ctl) {
      const send = (event: string, data: unknown) => {
        try { ctl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { stop?.(); }
      };
      stop = await subscribe(send, vid);
      ping = setInterval(() => { try { ctl.enqueue(enc.encode(": ping\n\n")); } catch {} }, 15000);
      req.signal.addEventListener("abort", () => { stop?.(); if (ping) clearInterval(ping); try { ctl.close(); } catch {} });
    },
    cancel() { stop?.(); if (ping) clearInterval(ping); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
