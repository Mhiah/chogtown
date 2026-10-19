"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createTown } from "@/town/scene";
import { Icon, ctrlIcons } from "./icons";
import { PLACES, type PlaceKey, type Me, type ChogView, type Shell } from "./types";
import { api, short } from "./client";
import HomePanel from "./panels/HomePanel";
import FeedPanel from "./panels/FeedPanel";
import ArenaPanel from "./panels/ArenaPanel";
import HallPanel from "./panels/HallPanel";
import ShopPanel from "./panels/ShopPanel";

type Town = ReturnType<typeof createTown>;

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
        <div className="brand"><Brand /> Chogtown</div>
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
            <Icon k={p.key} /><span>{p.dock}</span>
          </button>
        ))}
      </nav>

      <aside className={`sheet glass${active ? " open" : ""}`} aria-live="polite" aria-labelledby="sheet-title">
        <div className="sheet-head">
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
        <div className="intro-inner">
          <div className="eyebrow">Chogathon 2026 · Where every Chog has a life</div>
          <h1>Welcome to<br /><span>Chogtown</span></h1>
          <p>Every Chog lives here. By night they meet, gossip, fall out and make up. Each morning yours tells you what happened, and who it is becoming.</p>
          <button className="btn" onClick={() => { setEntered(true); town.current?.enter(); }}>Enter Chogtown</button>
        </div>
      </section>

      <div className={`toast glass${toastOn ? " show" : ""}`} role="status">{toastText}</div>
    </>
  );
}

function Brand() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 3l3 5 5-3-1 6 6 1-4 4 4 4-6 1 1 5-5-2-3 5-3-5-5 2 1-5-6-1 4-4-4-4 6-1-1-6 5 3z" fill="#5b3ab8" />
      <ellipse cx="16" cy="17.5" rx="7" ry="6" fill="#fff2d8" />
      <path d="M12 12l2 3 2-3 2 3 2-3v-2h-8z" fill="#5b3ab8" />
      <ellipse cx="13.4" cy="17.3" rx="1.3" ry="1.8" fill="#14091f" /><ellipse cx="18.6" cy="17.3" rx="1.3" ry="1.8" fill="#14091f" />
      <circle cx="11.2" cy="19.6" r="1.1" fill="#e0507d" opacity=".8" /><circle cx="20.8" cy="19.6" r="1.1" fill="#e0507d" opacity=".8" />
      <path d="M15 21.2q1 .8 2 0" stroke="#2a1450" strokeWidth=".8" fill="none" strokeLinecap="round" />
    </svg>
  );
}
