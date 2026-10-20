"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createTown } from "@/town/scene";
import { ctrlIcons } from "./icons";
import { PLACES, type PlaceKey, type Me, type ChogView, type Shell } from "./types";
import { api, short } from "./client";
import HomePanel from "./panels/HomePanel";
import FeedPanel from "./panels/FeedPanel";
import ArenaPanel from "./panels/ArenaPanel";
import HallPanel from "./panels/HallPanel";
import ShopPanel from "./panels/ShopPanel";

type Town = ReturnType<typeof createTown>;

/** Toybox art (public/toy): an icon per place for the dock, and the toy Chog doing that place's thing for the sheet header. */
export const PLACE_ICON: Record<PlaceKey, string> = { home: "/toy/i-home.webp", arena: "/toy/i-arena.webp", feed: "/toy/i-feed.webp", hall: "/toy/i-hall.webp", shop: "/toy/i-shop.webp" };
const PLACE_TOY: Record<PlaceKey, string> = { home: "/toy/hug.webp", arena: "/toy/fight.webp", feed: "/toy/read.webp", hall: "/toy/trophy.webp", shop: "/toy/selfie.webp" };

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const town = useRef<Town | null>(null);
  const [active, setActive] = useState<PlaceKey | null>(null);
  const [entered, setEntered] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [chog, setChog] = useState<ChogView | null>(null);
  const [toastText, setToastText] = useState("");
  const [toastOn, setToastOn] = useState(false);
  const [clock, setClock] = useState("");
  const [population, setPopulation] = useState<number | null>(null);
  const toastT = useRef<ReturnType<typeof setTimeout>>();

  const toast = useCallback((t: string) => {
    setToastText(t); setToastOn(true);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToastOn(false), 2600);
  }, []);

  const open = useCallback((key: PlaceKey) => {
    setEntered(true); town.current?.enter();
    setActive(key); town.current?.focus(key);
  }, []);
  const close = useCallback(() => { setActive(null); town.current?.overview(); }, []);
  const openRef = useRef(open); openRef.current = open;

  useEffect(() => {
    const t = createTown({ canvas: canvasRef.current, labelsEl: labelsRef.current, onOpen: (k: PlaceKey) => openRef.current(k) });
    town.current = t;
    return () => t.dispose();
  }, []);

  const refreshMe = useCallback(async () => { setMe(await api<Me>("/api/me").catch(() => ({ address: null, tokenId: null, guest: false, held: null, ai: false }))); }, []);
  useEffect(() => { refreshMe(); }, [refreshMe]);
  useEffect(() => { if (chog) town.current?.setLook(chog.look); }, [chog]);
  useEffect(() => { api<{ population: number }>("/api/town").then((d) => setPopulation(d.population)).catch(() => {}); }, []);
  useEffect(() => {
    const tick = () => {
      const d = new Date(), h = d.getHours();
      const part = h < 5 ? "Night" : h < 12 ? "Morning" : h < 17 ? "Afternoon" : h < 21 ? "Evening" : "Night";
      setClock(`${part} ${d.toTimeString().slice(0, 5)}`);
    };
    tick(); const i = setInterval(tick, 30000); return () => clearInterval(i);
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && active) close(); };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [active, close]);

  const shell: Shell = {
    me, refreshMe, chog, setChog, toast,
    bounce: () => town.current?.bounce(),
    setLook: (l) => town.current?.setLook(l),
  };
  const place = PLACES.find((p) => p.key === active);

  return (
    <>
      <canvas id="scene" ref={canvasRef} aria-label="Chogtown, a floating 3D city. Use the buttons to visit each place." />
      <header className="top">
        <div className="brand"><span className="mark"><img src="/toy/wave.webp" alt="" /></span> Chogtown</div>
        <div className="meta">
          <span className="pill glass when">{clock} <b>·</b> {population ? population.toLocaleString() : "…"} Chogs in town</span>
          <button className="pill glass btnlike" onClick={() => open("home")}>
            {me?.address ? short(me.address) : me?.guest ? "Guest" : "Sign in"}
          </button>
        </div>
      </header>

      <div id="labels" ref={labelsRef} />

      <div className="ctrl glass" role="group" aria-label="View">
        <button aria-label="Zoom in" onClick={() => town.current?.zoomIn()}>{ctrlIcons.zin}</button>
        <button aria-label="Zoom out" onClick={() => town.current?.zoomOut()}>{ctrlIcons.zout}</button>
        <button className="hide-m" aria-label="Rotate view" onClick={() => town.current?.rotate()}>{ctrlIcons.rot}</button>
        <button aria-label="Show the whole town" onClick={close}>{ctrlIcons.reset}</button>
      </div>

      <nav className="dock glass" aria-label="Places in Chogtown">
        {PLACES.map((p) => (
          <button key={p.key} aria-pressed={active === p.key} aria-label={p.name} onClick={() => (active === p.key ? close() : open(p.key))}>
            <img src={PLACE_ICON[p.key]} alt="" /><span>{p.dock}</span>
          </button>
        ))}
      </nav>

      <aside className={`sheet glass${active ? " open" : ""}`} aria-live="polite" aria-labelledby="sheet-title">
        <div className="sheet-head">
          {active && <img className="hero-toy" src={PLACE_TOY[active]} alt="" key={active} />}
          <div><div className="eyebrow">{place?.eyebrow}</div><h2 id="sheet-title">{place?.name}</h2></div>
          <button className="close" aria-label="Back to the town" onClick={close}>{ctrlIcons.close}</button>
        </div>
        <div className="sheet-body">
          {active === "home" && <HomePanel shell={shell} />}
          {active === "feed" && <FeedPanel shell={shell} />}
          {active === "arena" && <ArenaPanel shell={shell} />}
          {active === "hall" && <HallPanel shell={shell} />}
          {active === "shop" && <ShopPanel shell={shell} goHome={() => open("home")} />}
        </div>
      </aside>

      <section className={`intro${entered ? " gone" : ""}`}>
        <img className="intro-toy" src="/toy/wave.webp" alt="" />
        <div className="intro-inner">
          <div className="eyebrow">Chogathon 2026 · A floating toy town</div>
          <h1>Every Chog<br />has a <span>life.</span></h1>
          <p>All 1,969 Chogs live here. By night they gossip and feud. By day you check in, fight your rivals in the Rumble and blast jeets with your face.</p>
          <div className="btns">
            <button className="btn" onClick={() => { setEntered(true); town.current?.enter(); }}>Enter town →</button>
            <button className="btn ghost" onClick={() => open("home")}>Visit any Chog</button>
          </div>
          <div className="stats"><div><b>1,969</b><span>Chogs</span></div><div><b>5</b><span>places</span></div><div><b>every night</b><span>new gossip</span></div></div>
        </div>
      </section>

      <div className={`toast glass${toastOn ? " show" : ""}`} role="status">{toastText}</div>
    </>
  );
}

