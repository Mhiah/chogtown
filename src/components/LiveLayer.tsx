"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, errMsg, sendChogTip, short } from "./client";
import type { LiveView, MainView } from "./Diorama";
import type { Me } from "./types";

/** The live island's layer over the town: the Chog you tapped, playing your own Chog, hot feuds, and the Main Event. */

export const CARDS = [
  { key: "roast", name: "Roast", emote: "🔥", what: "Say it to their face. Heats the feud up a lot." },
  { key: "rumour", name: "Spread a rumour", emote: "🤫", what: "Whisper about someone else. Starts a new feud." },
  { key: "flirt", name: "Flirt", emote: "💘", what: "Clumsy, charming. Cools things down." },
  { key: "makeup", name: "Make up", emote: "🤝", what: "End the beef. Cools it right down." },
  { key: "challenge", name: "Challenge", emote: "🥊", what: "Needs Beef or worse. Books the Main Event." },
] as const;
const STAGE_NAMES = ["Cordial", "Side-eye", "Beef", "Public feud", "Main Event"];
const ARCH: Record<string, string> = { critic: "Critic", hype: "Hype Beast", dreamer: "Dreamer", schemer: "Schemer", sweetheart: "Sweetheart", drama: "Drama Queen", brawler: "Brawler", knowitall: "Know-it-all" };

type Feud = { heat: number; stage: number; name: string; log: string[]; next: { at: number; name: string } | null; owner?: string | null; tips?: number };
const TIPS = [100, 1000, 10000];

export function ChogCard({ id, x, y, live, me, onClose, onPlayAs, toast }: {
  id: number; x: number; y: number; live: LiveView | null; me: Me | null; onClose(): void; onPlayAs(id: number): Promise<void>; toast(t: string): void;
}) {
  const c = live?.chogs.find((k) => k.id === id);
  const mine = me?.tokenId === id;
  const [feud, setFeud] = useState<Feud | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const playing = !!me?.tokenId && live?.players.includes(me.tokenId);
  const taken = live?.players.includes(id) && !mine;
  const [tipping, setTipping] = useState<number | null>(null);
  useEffect(() => {
    api<Feud>(`/api/live/feud?b=${id}`).then(setFeud).catch(() => {});
  }, [id, me?.tokenId]);
  const need = me?.holder ? 1 : 2; // holders can call a rival out from Side-eye
  const canTip = !!me?.address && !!feud?.owner && feud.owner.toLowerCase() !== me.address.toLowerCase();
  const sendTip = async (amount: number) => {
    if (!me?.address || !feud?.owner) return;
    setTipping(amount);
    try {
      const hash = await sendChogTip(me.address, feud.owner, amount);
      toast("Tip sent. Checking it on Monad…");
      const r = await api<{ amount: number; total: number }>("/api/live/tip", { id, hash });
      setFeud((f) => (f ? { ...f, tips: Math.round(r.total) } : f));
      toast(`${Math.round(r.amount).toLocaleString()} $CHOG to ${c?.name}'s holder. Watch the island!`);
    } catch (e) { toast(errMsg(e)); }
    setTipping(null);
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [onClose]);
  if (!c) return null;

  const play = async (card: string) => {
    setBusy(true);
    try {
      const r = await api<{ feud: { heat: number; stage: number; name: string } | null; booked: boolean; refused: boolean }>("/api/live/act", { kind: "card", target: id, card });
      if (r.booked) toast("Challenge accepted. The Main Event is booked!");
      else if (r.refused) toast(`${c.name} won't fight yet. Get to Beef first.`);
      else if (r.feud) toast(`Feud with ${c.name}: ${r.feud.name} (${r.feud.heat}/100)`);
      onClose();
    } catch (e) { toast(errMsg(e)); }
    setBusy(false);
  };

  const W = 300, H = 400, left = Math.max(12, Math.min(innerWidth - W - 12, x - W / 2)), top = Math.max(70, Math.min(innerHeight - H - 12, y > innerHeight * .55 ? y - H - 24 : y + 18));
  return createPortal(
    <div className="live-card" style={{ left, top, width: W }} role="dialog" aria-label={c.name} onClick={(e) => e.stopPropagation()}>
      <button className="live-x" onClick={onClose} aria-label="Close">✕</button>
      <div className="live-card-head">
        {c.image && <img src={c.image} alt="" />}
        <div><b>{c.name} <span>#{c.id}</span></b><em>{ARCH[c.archetype] ?? c.archetype}{taken ? " · being played" : ""}</em></div>
      </div>
      {mine && <p className="live-note">That's you. Tap anywhere on the island to walk, or tap another Chog to play a card on it.</p>}
      {!mine && me?.tokenId && feud && (
        <div className="live-feud">
          <div className="live-feud-top"><span>Your feud</span><b className={`stage s${feud.stage}`}>{feud.name}</b></div>
          <div className="heat"><i style={{ width: `${feud.heat}%` }} /></div>
          {feud.log.length > 0 && <p className="live-note">“{feud.log[feud.log.length - 1]}”</p>}
        </div>
      )}
      {!mine && playing && !taken && (
        <div className="live-cards">
          {CARDS.map((k) => (
            <button key={k.key} className={`live-cardbtn${k.key === "challenge" ? " wide" : ""}`} disabled={busy || (k.key === "challenge" && (feud?.stage ?? 0) < need) || !!live?.main && !live.main.done}
              onClick={() => play(k.key)} onPointerEnter={() => setHint(k.what)} onFocus={() => setHint(k.what)} title={k.what}>
              <span className="e">{k.emote}</span><b>{k.name}</b>
            </button>
          ))}
        </div>
      )}
      {!mine && playing && !taken && (
        <p className="live-note hint">{busy ? "Walking over…" : hint ?? ((feud?.stage ?? 0) < need ? (me?.holder ? "👑 Holders can Challenge from Side-eye. One roast gets you there." : "Roast or spread rumours to reach Beef. Then you can Challenge.") : "It's on. Challenge them to the Main Event.")}</p>
      )}
      {!mine && me?.tokenId && !playing && <p className="live-note">Bring your Chog onto the island first (button at the top).</p>}
      {!mine && feud && (
        <div className="live-tip">
          <div className="live-feud-top"><span>🪙 $CHOG tips</span><b>{(feud.tips ?? 0).toLocaleString()}</b></div>
          {canTip ? (
            <div className="tip-row">{TIPS.map((t) => <button key={t} className="tipbtn" disabled={tipping !== null} onClick={() => sendTip(t)}>{tipping === t ? "…" : `Tip ${t >= 1000 ? `${t / 1000}k` : t}`}</button>)}</div>
          ) : (
            <p className="live-note">{me?.address ? (feud.owner ? "That's your own Chog." : "Couldn't find its holder right now.") : "Sign in with a wallet to tip this Chog's holder in $CHOG."}</p>
          )}
          {canTip && feud.owner && <p className="live-note small">Goes straight to its holder, {short(feud.owner)}. Your wallet asks you to approve it.</p>}
        </div>
      )}
      {!mine && !taken && (!me?.tokenId || !playing) && (
        <button className="btn small" disabled={busy} onClick={async () => { setBusy(true); await onPlayAs(id); setBusy(false); onClose(); }}>Play as {c.name}</button>
      )}
    </div>,
    document.body,
  );
}

export function PlayBar({ live, me, name, onJoin, onLeave, onSignIn }: { live: LiveView | null; me: Me | null; name: string | null; onJoin(): void; onLeave(): void; onSignIn(): void }) {
  if (!live) return null;
  const playing = !!me?.tokenId && live.players.includes(me.tokenId);
  return (
    <div className={`playbar${playing ? " on" : ""}`}>
      {!me?.tokenId && <><span>Tap any Chog on the island to play as it</span><button className="btn small ghost" onClick={onSignIn}>Holder? Sign in 👑</button></>}
      {me?.tokenId && !playing && <><span>Play as <b>{name ?? `#${me.tokenId}`}</b>?</span><button className="btn small" onClick={onJoin}>Bring it onto the island</button></>}
      {playing && <><span className="dot" />{me?.holder && <span className="perk-tag">👑 Holder</span>}<span><b>{name ?? "Your Chog"}</b> is live<span className="hide-m">. Tap the island to walk, tap a Chog for cards.</span><span className="show-m"> · tap to walk</span></span><button className="btn small ghost" onClick={onLeave}>Switch</button></>}
    </div>
  );
}

export function FeudTicker({ live }: { live: LiveView | null }) {
  if (!live?.feuds.length) return null;
  return (
    <div className="feuds glass" aria-label="Hottest feuds on the island">
      <div className="eyebrow">Hot feuds</div>
      {live.feuds.slice(0, 4).map((f) => (
        <div key={`${f.a}-${f.b}`} className="feud-row">
          <span className="who">{f.an} <i>vs</i> {f.bn}</span>
          <b className={`stage s${f.stage}`}>{STAGE_NAMES[f.stage]}</b>
          <span className="heat"><i style={{ width: `${f.heat}%` }} /></span>
        </div>
      ))}
    </div>
  );
}

/** The Main Event: bell, countdown, picks, and the fight itself, in sync for everyone. */
export function MainEvent({ live, offset, toast }: { live: LiveView | null; offset: number; toast(t: string): void }) {
  const m = live?.main ?? null;
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [mine, setMine] = useState<Record<string, "a" | "b">>({});
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(i); }, []);
  const local = (t: number) => t - offset; // server ms -> this browser's clock
  // the fight opens by itself a few seconds before the bell, unless you closed it
  useEffect(() => { if (m && !m.done && dismissed !== m.id && now >= local(m.startAt) - 6000 && now < local(m.endAt)) setOpen(true); }, [m, now, dismissed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!m) setOpen(false); }, [m]);
  if (!m) return null;
  const toStart = Math.max(0, Math.ceil((local(m.startAt) - now) / 1000));
  const live_ = now >= local(m.startAt) && now < local(m.endAt);
  const pick = async (side: "a" | "b") => {
    try { await api("/api/live/act", { kind: "pick", side }); setMine((x) => ({ ...x, [m.id]: side })); toast(`You picked ${(side === "a" ? m.a : m.b).name}.`); }
    catch (e) { toast(errMsg(e)); }
  };
  const picked = mine[m.id];
  return (
    <>
      {!open && (
        <div className="main-banner" role="status">
          <span className="bell">🔔</span>
          <span><b>MAIN EVENT</b> {m.a.name} vs {m.b.name} · {m.done ? `${(m.winner === "a" ? m.a : m.b).name} won` : live_ ? "LIVE now" : `starts in ${Math.floor(toStart / 60)}:${String(toStart % 60).padStart(2, "0")}`}</span>
          <button className="btn small" onClick={() => setOpen(true)}>{m.done ? "Result" : "Watch"}</button>
        </div>
      )}
      {open && <MainStage m={m} now={now} local={local} picked={picked} onPick={pick} onClose={() => { setOpen(false); setDismissed(m.id); }} />}
    </>
  );
}

function MainStage({ m, now, local, picked, onPick, onClose }: { m: MainView; now: number; local(t: number): number; picked?: "a" | "b"; onPick(s: "a" | "b"): void; onClose(): void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ended, setEnded] = useState<boolean>(m.done);
  const [localWinner, setLocalWinner] = useState<"a" | "b" | null>(null);
  const started = now >= local(m.startAt) - 3500;
  const total = m.picks.a + m.picks.b;
  useEffect(() => {
    if (!started || ended || !canvas.current) return;
    let g: { dispose(): void } | null = null, alive = true;
    import("@/arena/rumble").then(({ createRumble }) => {
      if (!alive || !canvas.current) return;
      g = createRumble({ canvas: canvas.current, me: m.a, foe: m.b, auto: true, seed: m.seed, startAt: local(m.startAt), spectate: true, onEnd: (r: { won: boolean }) => { setLocalWinner(r.won ? "a" : "b"); setEnded(true); } });
    });
    return () => { alive = false; g?.dispose(); };
  }, [started, ended, m.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const winner = m.winner ?? localWinner;
  const toStart = Math.max(0, Math.ceil((local(m.startAt) - now) / 1000));
  return createPortal(
    <div className="rumble main-stage">
      {!started && (
        <div className="rumble-vs">
          <div className="main-eyebrow">🔔 Main Event · Royal Amphitheatre</div>
          <div className="vs-side left"><img src={m.a.image} alt="" /><div className="vs-name">{m.a.label}</div><div className="vs-type">{m.a.archetypeName} · {m.a.record.w}–{m.a.record.l}</div>
            <button className={`btn${picked === "a" ? "" : " ghost"}`} disabled={!!picked} onClick={() => onPick("a")}>{picked === "a" ? "Your pick ✓" : `Pick ${m.a.name}`}</button></div>
          <div className="vs-mid">VS</div>
          <div className="vs-side right"><img src={m.b.image} alt="" /><div className="vs-name">{m.b.label}</div><div className="vs-type">{m.b.archetypeName} · {m.b.record.w}–{m.b.record.l}</div>
            <button className={`btn${picked === "b" ? "" : " ghost"}`} disabled={!!picked} onClick={() => onPick("b")}>{picked === "b" ? "Your pick ✓" : `Pick ${m.b.name}`}</button></div>
          <div className="vs-foot">
            <p className="note">{m.why} Everyone on the island watches the same fight.</p>
            <div className="main-count">Starts in <b>{toStart}s</b>{total > 0 && <> · {m.picks.a} picked {m.a.name}, {m.picks.b} picked {m.b.name}</>}</div>
          </div>
        </div>
      )}
      {started && (
        <div className="rumble-stage">
          {!ended && <canvas ref={canvas} className="rumble-canvas" />}
          <div className="main-live">{ended ? "Main Event" : "● LIVE"} · {m.a.name} vs {m.b.name}</div>
          {ended && (
            <div className="rumble-done">
              <div className="eyebrow">Main Event result</div>
              <h2>{winner ? `${(winner === "a" ? m.a : m.b).name} wins` : "And that's the fight"}</h2>
              <p className="note">{picked ? (winner ? (picked === winner ? "You called it." : "Not your night. The island will remember.") : "") : "The feud is settled. For now."}</p>
              <div className="vs-btns"><button className="btn" onClick={onClose}>Back to the island</button></div>
            </div>
          )}
        </div>
      )}
      <button className="rumble-x" aria-label="Back to the island" onClick={onClose}>✕</button>
    </div>,
    document.body,
  );
}
