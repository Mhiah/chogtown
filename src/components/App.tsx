"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ctrlIcons } from "./icons";
import Diorama, { type LiveView } from "./Diorama";
import { ChogCard, PlayBar, FeudTicker, MainEvent } from "./LiveLayer";
import { PLACES, type PlaceKey, type Me, type ChogView, type Shell } from "./types";
import { api, short } from "./client";
import HomePanel from "./panels/HomePanel";
import FeedPanel from "./panels/FeedPanel";
import ArenaPanel from "./panels/ArenaPanel";
import HallPanel from "./panels/HallPanel";
import ShopPanel from "./panels/ShopPanel";
import CasinoPanel from "./panels/CasinoPanel";

/** Toybox art (public/toy): an icon per place for the dock, and the toy Chog doing that place's thing for the sheet header. */
export const PLACE_ICON: Record<PlaceKey, string> = { home: "/toy/i-home.webp", arena: "/toy/i-arena.webp", feed: "/toy/i-feed.webp", hall: "/toy/i-hall.webp", shop: "/toy/i-shop.webp", casino: "/toy/i-casino.webp" };
const PLACE_TOY: Record<PlaceKey, string> = { home: "/toy/hug.webp", arena: "/toy/fight.webp", feed: "/toy/read.webp", hall: "/toy/trophy.webp", shop: "/toy/selfie.webp", casino: "/toy/chips.webp" };

export default function App() {
  const [bounceKey, setBounceKey] = useState(0);
  const [active, setActive] = useState<PlaceKey | null>(null);
  const [entered, setEntered] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [chog, setChog] = useState<ChogView | null>(null);
  const [toastText, setToastText] = useState("");
  const [toastOn, setToastOn] = useState(false);
  const [clock, setClock] = useState("");
  const [population, setPopulation] = useState<number | null>(null);
  const toastT = useRef<ReturnType<typeof setTimeout>>();
  const [live, setLive] = useState<LiveView | null>(null);
  const [offset, setOffset] = useState(0);
  const [picked, setPicked] = useState<{ id: number; x: number; y: number } | null>(null);
  const onLive = useCallback((v: LiveView) => { setLive(v); setOffset(v.now - Date.now()); }, []);

  const toast = useCallback((t: string) => {
    setToastText(t); setToastOn(true);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToastOn(false), 2600);
  }, []);

  const open = useCallback((key: PlaceKey) => { setEntered(true); setActive(key); }, []);
  const close = useCallback(() => setActive(null), []);

  const refreshMe = useCallback(async () => { setMe(await api<Me>("/api/me").catch(() => ({ address: null, tokenId: null, guest: false, held: null, ai: false }))); }, []);
  useEffect(() => { refreshMe(); }, [refreshMe]);
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

  const myName = live?.chogs.find((c) => c.id === me?.tokenId)?.name ?? null;
  const join = useCallback(async () => {
    try { await api("/api/live/act", { kind: "join" }); toast("You're on the island. Tap anywhere to walk."); }
    catch (e) { toast(e instanceof Error ? e.message : String(e)); }
  }, [toast]);
  const playAs = useCallback(async (id: number) => {
    try {
      if (me?.address) {
        if (!(me.held?.ids ?? []).includes(id)) { toast("Signed in with a wallet, you play your own Chogs. Pick one in Your Chogmate."); return; }
        await api("/api/me/chog", { tokenId: id });
      } else await api("/api/auth/guest", { tokenId: id });
      await refreshMe();
      await api("/api/live/act", { kind: "join" });
      toast("You're on the island. Tap anywhere to walk, tap a Chog for cards.");
    } catch (e) { toast(e instanceof Error ? e.message : String(e)); }
  }, [me, refreshMe, toast]);
  const walk = useCallback((node: string) => {
    if (!me?.tokenId || !live?.players.includes(me.tokenId)) return;
    api("/api/live/act", { kind: "walk", node }).catch((e) => toast(e instanceof Error ? e.message : String(e)));
  }, [me, live, toast]);

  const shell: Shell = {
    me, refreshMe, chog, setChog, toast, live, offset,
    bounce: () => setBounceKey((b) => b + 1),
    setLook: () => {}, // looks show on the Boutique card; the diorama keeps the town mascot
  };
  const place = PLACES.find((p) => p.key === active);

  return (
    <>
      <Diorama active={active} entered={entered} onOpen={open} bounceKey={bounceKey} mine={me?.tokenId ?? null}
        onChog={(id, x, y) => setPicked({ id, x, y })} onWalk={walk} onLive={onLive} />
      {entered && !active && <><PlayBar live={live} me={me} name={myName} onJoin={join} onLeave={() => setPicked(null)} /><FeudTicker live={live} /></>}
      {picked && <ChogCard id={picked.id} x={picked.x} y={picked.y} live={live} me={me} onClose={() => setPicked(null)} onPlayAs={playAs} toast={toast} />}
      <MainEvent live={live} offset={offset} toast={toast} />
      <header className="top">
        <div className="brand"><span className="mark"><img src="/toy/wave.webp" alt="" /></span> Chogtown</div>
        <div className="meta">
          <span className="pill glass when">{clock} <b>·</b> {population ? population.toLocaleString() : "…"} Chogs in town</span>
          <button className="pill glass btnlike" onClick={() => open("home")}>
            {me?.address ? short(me.address) : me?.guest ? "Guest" : "Sign in"}
          </button>
        </div>
      </header>

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
          {active === "casino" && <CasinoPanel shell={shell} />}
        </div>
      </aside>

      <section className={`intro${entered ? " gone" : ""}`}>
        <div className="intro-inner">
          <div className="eyebrow">Chogathon 2026 · A floating toy town</div>
          <h1>Every Chog<br />has a <span>life.</span></h1>
          <p>All 1,969 Chogs live here. By night they gossip and feud. By day you check in, fight your rivals in the Rumble and blast jeets with your face.</p>
          <div className="btns">
            <button className="btn" onClick={() => setEntered(true)}>Enter town →</button>
            <button className="btn ghost" onClick={() => open("home")}>Visit any Chog</button>
          </div>
          <div className="stats"><div><b>1,969</b><span>Chogs</span></div><div><b>5</b><span>places</span></div><div><b>every night</b><span>new gossip</span></div></div>
        </div>
      </section>

      <div className={`toast glass${toastOn ? " show" : ""}`} role="status">{toastText}</div>
    </>
  );
}

