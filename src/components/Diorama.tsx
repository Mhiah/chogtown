"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlaceKey } from "./types";
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

export default function Diorama({ active, entered, onOpen, bounceKey }: { active: PlaceKey | null; entered: boolean; onOpen(k: PlaceKey): void; bounceKey: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ W: 1440, H: 900 });
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<PlaceKey | null>(null);
  const [jump, setJump] = useState(0);

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

  const tall = size.W / size.H < .9;
  const art = tall ? TALL : WIDE;
  // phones: fit the width and sit the island on the dock; the sky gradient fills the top
  const c = tall ? fitWidth(art, size.W, size.H) : cover(art, size.W, size.H, .85, .5);
  const at = useCallback((p: Spot) => ({ left: c.x + p.x * c.w, top: c.y + p.y * c.h }), [c.x, c.y, c.w, c.h]);
  const px = tilt.x * -10, py = tilt.y * -6;

  return (
    <div ref={box} className={`diorama${active ? " focused" : ""}${entered ? " entered" : ""}`} aria-label="Chogtown, a floating toy town. Use the buttons to visit each place.">
      <div className="dio-world" style={{ transform: `translate3d(${px}px, ${py}px, 0) scale(${active ? 1.08 : 1.02})` }}>
        <img className="dio-art" src={art.src} alt="" style={{ left: c.x, top: c.y, width: c.w, height: c.h }} draggable={false} />
        <img key={jump} className="dio-toy" src="/toy/wave.webp" alt="" draggable={false}
          style={{ left: c.x + art.toy.x * c.w, top: c.y + art.toy.y * c.h, width: art.toy.size * c.w }} />
        {!active && entered && PLACES.map((p) => (
          <button key={p.key} className={`dio-spot${hover === p.key ? " hot" : ""}`} style={at(art.spots[p.key])}
            onPointerEnter={() => setHover(p.key)} onPointerLeave={() => setHover(null)} onClick={() => onOpen(p.key)} aria-label={`${p.name}: ${BLURB[p.key]}`}>
            <i className="ring" />
            <span className="dio-tag"><img src={`/toy/i-${p.key}.webp`} alt="" /><span><b className="long">{p.name}</b><b className="short">{p.dock}</b><em>{BLURB[p.key]}</em></span></span>
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
