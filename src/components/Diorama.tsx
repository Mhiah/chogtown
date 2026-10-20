"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlaceKey } from "./types";
import { createSim } from "@/live/sim";
import { drawIsland } from "@/live/render";
import { NODES } from "@/live/map";
import { PLACES } from "./types";

/**
 * The town as a toy diorama. Higgsfield renders (public/town) replace the old flat three.js town:
 * the whole island in overview, a close-up render per place when you open it, places you can tap,
 * the toy Chog standing on the island, drifting clouds and a little parallax.
 */

type Spot = { x: number; y: number };
type Art = { src: string; w: number; h: number; spots: Record<PlaceKey, Spot>; toy: Spot & { size: number } };

// Spot and toy positions are fractions of each image (0..1), measured on the renders.
export const WIDE: Art = {
  src: "/town/island.jpg", w: 2752, h: 1536,
  spots: { home: { x: .704, y: .5 }, arena: { x: .568, y: .33 }, feed: { x: .83, y: .16 }, hall: { x: .554, y: .55 }, shop: { x: .905, y: .52 } },
  toy: { x: .37, y: .86, size: .12 },
};
export const TALL: Art = {
  src: "/town/island-tall.jpg", w: 1290, h: 2311,
  spots: { home: { x: .5, y: .62 }, arena: { x: .5, y: .47 }, feed: { x: .82, y: .4 }, hall: { x: .18, y: .67 }, shop: { x: .77, y: .7 } },
  toy: { x: .5, y: .82, size: .2 },
};
const CLOSE: Record<PlaceKey, string> = { home: "/town/home.jpg", arena: "/town/arena.jpg", feed: "/town/feed.jpg", hall: "/town/hall.jpg", shop: "/town/shop.jpg" };
const BLURB: Record<PlaceKey, string> = {
  home: "Check in, chat, see who it is becoming", arena: "Rumble your rivals · tonight's debate", feed: "Last night's gossip",
  hall: "Streaks, wins and feuds", shop: "Face Booth & dress-up",
};

/** Where an image drawn with object-fit: cover lands in a box, so spots can sit on the art. */
function cover(art: Art, W: number, H: number, ax = .5, ay = .5) {
  const s = Math.max(W / art.w, H / art.h), w = art.w * s, h = art.h * s;
  return { s, w, h, x: (W - w) * ax, y: (H - h) * ay };
}

function fitWidth(art: Art, W: number, H: number) {
  const s = Math.max(W / art.w, (H * .78) / art.h), w = art.w * s, h = art.h * s;
  return { s, w, h, x: (W - w) / 2, y: H - h + h * .04 };
}

export interface DioramaHandle { bounce(): void }

export interface LiveView {
  now: number; t: number; rally: boolean; players: number[];
  feuds: { a: number; b: number; an: string; bn: string; heat: number; stage: number }[];
  main: MainView | null; lastMain: MainView | null;
  chogs: { id: number; name: string; archetype: string; image: string | null; out: boolean }[];
}
export interface MainView { id: string; a: any; b: any; seed: number; why: string; bellAt: number; startAt: number; endAt: number; picks: { a: number; b: number }; done: boolean; winner: "a" | "b" | null }

export default function Diorama({ active, entered, onOpen, bounceKey, mine, onChog, onWalk, onLive }: {
  active: PlaceKey | null; entered: boolean; onOpen(k: PlaceKey): void; bounceKey: number;
  mine?: number | null; onChog?(id: number, x: number, y: number): void; onWalk?(node: string): void; onLive?(v: LiveView): void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ W: 1440, H: 900 });
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<PlaceKey | null>(null);
  const [jump, setJump] = useState(0);
  const live = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<any>(null);
  const hits = useRef<{ id: number; x: number; y: number; w: number; h: number }[]>([]);
  const hoverChog = useRef<number | null>(null);
  const [chogTag, setChogTag] = useState(false);
  const [inside, setInside] = useState<Partial<Record<PlaceKey, number>>>({});
  useEffect(() => { const i = setInterval(() => simRef.current && setInside(simRef.current.inside()), 1000); return () => clearInterval(i); }, []);

  useEffect(() => {
    const r = () => setSize({ W: innerWidth, H: innerHeight });
    r(); addEventListener("resize", r); return () => removeEventListener("resize", r);
  }, []);
  useEffect(() => { if (bounceKey) { setJump((j) => j + 1); } }, [bounceKey]);
  // gentle parallax with the pointer (or phone tilt); off for reduced motion
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const m = (e: PointerEvent) => setTilt({ x: (e.clientX / innerWidth - .5) * 2, y: (e.clientY / innerHeight - .5) * 2 });
    addEventListener("pointermove", m); return () => removeEventListener("pointermove", m);
  }, []);
  // tap a Chog to see it (and play cards on it); tap the island to walk your own Chog there
  const tap = (e: React.MouseEvent) => {
    const cv = live.current; if (!cv || !entered || active) return;
    const b = cv.getBoundingClientRect(), sx = b.width / view.current.W || 1;
    const x = (e.clientX - b.left) / sx, y = (e.clientY - b.top) / sx;
    let id: number | null = null;
    for (const h of hits.current) if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) id = h.id;
    if (id !== null) { onChog?.(id, e.clientX, e.clientY); return; }
    if (!mineRef.current || !onWalk) return;
    const fx = (e.clientX - b.left) / b.width, fy = (e.clientY - b.top) / b.height, which = view.current.which;
    let best: string | null = null, bd = .06;
    for (const n of NODES) { const [nx, ny] = (n as any)[which] as number[]; const d = Math.hypot(nx - fx, (ny - fy) * (which === "t" ? .55 : 1)); if (d < bd) { bd = d; best = n.id; } }
    if (best) onWalk(best);
  };

  const tall = size.W / size.H < .9;
  const art = tall ? TALL : WIDE;
  // phones: fit the width and sit the island on the dock; the sky gradient fills the top
  const c = tall ? fitWidth(art, size.W, size.H) : cover(art, size.W, size.H, .85, .5);
  const at = useCallback((p: Spot) => ({ left: c.x + p.x * c.w, top: c.y + p.y * c.h }), [c.x, c.y, c.w, c.h]);
  const px = tilt.x * -10, py = tilt.y * -6;

  // the live island: the server runs it and streams it; every viewer sees the same Chogs in the same places.
  // If the stream can't connect, the island still lives, run locally.
  const liveCb = useRef(onLive); liveCb.current = onLive;
  useEffect(() => {
    let dead = false, local = false;
    const follow = createSim([], { follow: true });
    const es = new EventSource("/api/live/stream");
    const fallback = setTimeout(() => {
      if (dead || simRef.current) return;
      local = true;
      fetch("/api/live/cast").then((r) => r.json()).then((d) => {
        if (dead || !d.cast || simRef.current !== null && !local) return;
        simRef.current = createSim(d.cast, { seed: Math.floor(Date.now() / 864e5) });
      }).catch(() => {});
    }, 6000);
    es.addEventListener("island", (e) => {
      if (dead) return;
      const v = JSON.parse((e as MessageEvent).data);
      follow.load(v);
      if (simRef.current !== follow) { simRef.current = follow; (window as any).__island = follow; }
      liveCb.current?.(v);
    });
    return () => { dead = true; clearTimeout(fallback); es.close(); };
  }, []);
  const mineRef = useRef(mine); mineRef.current = mine;
  const view = useRef({ W: 0, H: 0, base: 0, which: "w", dpr: 1, still: false });
  view.current = { W: c.w, H: c.h, base: (tall ? .042 : .022) * c.w, which: tall ? "t" : "w", dpr: Math.min(2, typeof devicePixelRatio === "number" ? devicePixelRatio : 1), still: false };
  useEffect(() => {
    const cv = live.current; if (!cv) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(.1, (now - last) / 1000); last = now;
      const sim = simRef.current, v = view.current;
      if (!sim || !v.W) return;
      if (cv.width !== Math.round(v.W * v.dpr)) { cv.width = Math.round(v.W * v.dpr); cv.height = Math.round(v.H * v.dpr); }
      sim.step(dt);
      for (const ch of sim.chogs) ch.mine = ch.id === mineRef.current;
      hits.current = drawIsland(cv.getContext("2d")!, sim, { ...v, still }, sim.t, hoverChog.current);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  // hover a Chog to see who it is (the canvas lets clicks through to the place spots)
  useEffect(() => {
    const m = (e: PointerEvent) => {
      const cv = live.current; if (!cv) return;
      const b = cv.getBoundingClientRect(), sx = b.width / view.current.W || 1;
      const x = (e.clientX - b.left) / sx, y = (e.clientY - b.top) / sx;
      let id: number | null = null;
      for (const h of hits.current) if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) id = h.id;
      hoverChog.current = id; setChogTag(id !== null);
    };
    addEventListener("pointermove", m); return () => removeEventListener("pointermove", m);
  }, []);

  return (
    <div ref={box} onClick={tap} className={`diorama${active ? " focused" : ""}${entered ? " entered" : ""}${chogTag ? " chog-hot" : ""}`} aria-label="Chogtown, a floating toy town. Use the buttons to visit each place.">
      <div className="dio-world" style={{ transform: `translate3d(${px}px, ${py}px, 0) scale(${active ? 1.08 : 1.02})` }}>
        <img className="dio-art" src={art.src} alt="" style={{ left: c.x, top: c.y, width: c.w, height: c.h }} draggable={false} />
        <canvas ref={live} className={`dio-live${chogTag ? " hot" : ""}`} aria-hidden="true" style={{ left: c.x, top: c.y, width: c.w, height: c.h }} />
        <img key={jump} className="dio-toy" src="/toy/wave.webp" alt="" draggable={false}
          style={{ left: c.x + art.toy.x * c.w, top: c.y + art.toy.y * c.h, width: art.toy.size * c.w }} />
        {!active && entered && PLACES.map((p) => (
          <button key={p.key} className={`dio-spot${hover === p.key ? " hot" : ""}`} style={at(art.spots[p.key])}
            onPointerEnter={() => setHover(p.key)} onPointerLeave={() => setHover(null)} onClick={() => onOpen(p.key)} aria-label={`${p.name}: ${BLURB[p.key]}`}>
            <i className="ring" />
            <span className="dio-tag"><img src={`/toy/i-${p.key}.webp`} alt="" />{!!inside[p.key] && <i className="dio-count" title={`${inside[p.key]} Chogs inside`}>{inside[p.key]}</i>}<span><b className="long">{p.name}</b><b className="short">{p.dock}</b><em>{BLURB[p.key]}</em></span></span>
          </button>
        ))}
      </div>
      {/* a close-up render per place, faded in behind its sheet */}
      {PLACES.map((p) => (
        <div key={p.key} className={`dio-close${active === p.key ? " on" : ""}`} style={{ backgroundImage: `url(${CLOSE[p.key]})` }} aria-hidden="true" />
      ))}
      <div className="dio-clouds" aria-hidden="true"><i /><i /><i /><i /></div>
    </div>
  );
}
