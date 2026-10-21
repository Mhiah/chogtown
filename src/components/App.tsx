"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ctrlIcons } from "./icons";
import Diorama, { type LiveView } from "./Diorama";
import { ChogCard, PlayBar, FeudTicker, MainEvent } from "./LiveLayer";
import Onboarding from "./Onboarding";
import Quests from "./Quests";
import { sfx, setMuted, isMuted } from "@/arena/sfx";
import { startMusic } from "@/live/music";
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
  const [help, setHelp] = useState(false);
  const [muted, setMute] = useState(false);
  useEffect(() => { setMute(isMuted()); }, []);
  // sound needs a click first: the first one after entering starts the town's music box
  useEffect(() => {
    if (!entered) return;
    const go = () => { startMusic(); removeEventListener("pointerdown", go); };
    addEventListener("pointerdown", go); return () => removeEventListener("pointerdown", go);
  }, [entered]);

  const toast = useCallback((t: string) => {
    setToastText(t); setToastOn(true);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToastOn(false), 2600);
  }, []);
  // a real Chog trade on Monad: tell everyone watching
  const seenMoves = useRef<Set<string> | null>(null);
  const onLive = useCallback((v: LiveView) => {
    setLive(v); setOffset(v.now - Date.now());
    const moved = (v as LiveView & { moved?: { id: number; name: string; t: number }[] }).moved ?? [];
    if (!seenMoves.current) { seenMoves.current = new Set(moved.map((m) => `${m.id}:${m.t}`)); return; }
    for (const m of moved) { const k = `${m.id}:${m.t}`; if (!seenMoves.current.has(k)) { seenMoves.current.add(k); toast(`🏠 ${m.name} #${m.id} just changed hands on Monad. Its feuds go with it.`); } }
  }, [toast]);

  const open = useCallback((key: PlaceKey) => { setEntered(true); setActive(key); }, []);
  const close = useCallback(() => setActive(null), []);

  const refreshMe = useCallback(async () => { setMe(await api<Me>("/api/me").catch(() => ({ address: null, tokenId: null, guest: false, held: null, ai: false }))); }, []);
  useEffect(() => { refreshMe(); }, [refreshMe]);
  // arriving from the judge link
  useEffect(() => {
    const j = new URLSearchParams(location.search).get("judge");
    if (!j) return;
    history.replaceState(null, "", location.pathname);
    setEntered(true);
    toast(j === "1" ? "🎫 Judge pass on. Tap any Chog on the island to play as it." : "That judge link didn't work. Check the code.");
  }, [toast]);
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
      if (me?.address && (me.held?.ids ?? []).includes(id)) await api("/api/me/chog", { tokenId: id });
      else if (me?.judge) await api("/api/auth/guest", { tokenId: id });
      else { toast("Only holders play. Sign in with the wallet that holds this Chog."); open("home"); return; }
      await refreshMe();
      await api("/api/live/act", { kind: "join" });
      toast("You're on the island. Tap anywhere to walk, tap a Chog for cards.");
    } catch (e) { toast(e instanceof Error ? e.message : String(e)); }
  }, [me, refreshMe, toast]);
  const walk = useCallback((node: string) => {
    if (!me?.tokenId || !me.canPlay || !live?.players.includes(me.tokenId)) return;
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
      {entered && !active && <><PlayBar live={live} me={me} name={myName} onJoin={join} onLeave={() => setPicked(null)} onSignIn={() => open("home")} /><FeudTicker live={live} /></>}
      {picked && <ChogCard id={picked.id} x={picked.x} y={picked.y} live={live} me={me} onClose={() => setPicked(null)} onPlayAs={playAs} onSignIn={() => open("home")} toast={toast} />}
      <MainEvent live={live} offset={offset} toast={toast} entered={entered} quiet={!!active} />
      <Onboarding entered={entered && !active} open={help} onClose={() => setHelp(false)} />
      <header className="top">
        <div className="brand"><span className="mark"><img src="/toy/head.webp" alt="" /></span> <span className="brand-name">Chogtown</span></div>
        <div className="meta">
          <Quests entered={entered} playing={!!me?.tokenId && !!live?.players.includes(me.tokenId)} toast={toast} />
          <button className="pill glass btnlike help" aria-label={muted ? "Sound on" : "Sound off"} onClick={() => { const m = !muted; setMuted(m); setMute(m); if (!m) { startMusic(); sfx.blip(); } }}>{muted ? "🔇" : "🔊"}</button>
          <button className="pill glass btnlike how" aria-label="How Chogtown works" onClick={() => { setEntered(true); setHelp(true); }}><span className="lbl-l">How it works</span><span className="lbl-s">Help</span></button>
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
          <div className="eyebrow">A live reality show starring all 1,969 Chogs</div>
          <h1>Every Chog<br />has a <span>life.</span></h1>
          <p>The cameras never stop. Chogs walk, gossip and pick fights on their own, and everyone watches the same town live. Holders step in with their own Chog: roast a rival, start a rumour, push a feud all the way to the Main Event.</p>
          <div className="btns">
            <button className="btn" onClick={() => { setEntered(true); startMusic(); }}>Watch live →</button>
            <button className="btn ghost" onClick={() => open("home")}>👑 Play your Chog</button>
          </div>
          <div className="stats"><div><b>1,969</b><span>Chogs</span></div><div><b>{PLACES.length}</b><span>places</span></div><div><b>every 6 min</b><span>a Main Event</span></div></div>
        </div>
      </section>

      <div className={`toast glass${toastOn ? " show" : ""}`} role="status">{toastText}</div>
    </>
  );
}

