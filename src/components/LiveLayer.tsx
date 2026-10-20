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
/** Trait powers (src/lib/powers.ts): cards only Chogs with the right traits get. */
export const POWER_CARDS: Record<string, { name: string; emote: string; from: string; what: string }> = {
  zap: { name: "Zap", emote: "⚡", from: "laser eyes", what: "Laser-zap them. Stuns them and heats the feud up a lot." },
  crown: { name: "Claim the Crown", emote: "👑", from: "a crown or royal robes", what: "Take the town's crown and become Chog of the Day." },
  frogdad: { name: "Frog Dad", emote: "🐸", from: "a frog", what: "Frog Dad ends the feud. Back to Cordial." },
  haunt: { name: "Haunt", emote: "👻", from: "a Skull or Radioactive base", what: "Night only (19–06 UTC). Spook them so badly they run inside." },
  pump: { name: "Pump", emote: "🟢", from: "a Green Candle", what: "Main Event only: pump a fighter's side of the betting pool." },
  dump: { name: "Dump", emote: "🔴", from: "a Red Candle", what: "Main Event only: dump a fighter's side of the betting pool." },
  prank: { name: "Prank", emote: "🤡", from: "clown traits", what: "They laugh it off, or it backfires badly." },
};
const ARCH: Record<string, string> = { critic: "Critic", hype: "Hype Beast", dreamer: "Dreamer", schemer: "Schemer", sweetheart: "Sweetheart", drama: "Drama Queen", brawler: "Brawler", knowitall: "Know-it-all" };

type Dna = { personality: string; eyes: string; mouth: string; moves: { slot: string; what: string; trait: string }[]; powers?: string[] };
type Feud = { heat: number; stage: number; name: string; log: string[]; next: { at: number; name: string } | null; owner?: string | null; tips?: number; dna?: Dna | null };
const TIPS = [100, 1000, 10000];

export function ChogCard({ id, x, y, live, me, onClose, onPlayAs, onSignIn, toast }: {
  id: number; x: number; y: number; live: LiveView | null; me: Me | null; onClose(): void; onPlayAs(id: number): Promise<void>; onSignIn(): void; toast(t: string): void;
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
      if (card === "pump" || card === "dump") toast(card === "pump" ? `Pumped ${c.name}'s side of the pool. Watch the odds move.` : `Dumped on ${c.name}. The odds just moved.`);
      else if (card === "crown") toast("👑 You're Chog of the Day. Guard that crown.");
      else if (r.booked) toast("Challenge accepted. The Main Event is booked!");
      else if (r.refused) toast(`${c.name} won't fight yet. Get to Beef first.`);
      else if (r.feud) toast(`Feud with ${c.name}: ${r.feud.name} (${r.feud.heat}/100)`);
      onClose();
    } catch (e) { toast(errMsg(e)); }
    setBusy(false);
  };

  const W = 310, H = 460, left = Math.max(12, Math.min(innerWidth - W - 12, x - W / 2)), top = Math.max(70, Math.min(innerHeight - H - 12, y > innerHeight * .55 ? y - H - 24 : y + 18));
  return createPortal(
    <div className="live-card" style={{ left, top, width: W, maxHeight: innerHeight - top - 12 }} role="dialog" aria-label={c.name} onClick={(e) => e.stopPropagation()}>
      <button className="live-x" onClick={onClose} aria-label="Close">✕</button>
      <div className="live-card-head">
        {c.image && <img src={c.image} alt="" />}
        <div><b>{c.name} <span>#{c.id}</span></b><em>{ARCH[c.archetype] ?? c.archetype}{taken ? " · 🎮 a player" : ""}</em></div>
      </div>
      {feud?.dna && (
        <div className="live-dna" title="Everything this Chog does comes from its NFT traits">
          <div className="live-feud-top"><span>Made by its traits</span></div>
          <p className="live-note"><b>{feud.dna.personality}</b> because of its <i>{feud.dna.eyes || "eyes"}</i> eyes{feud.dna.mouth ? <> and <i>{feud.dna.mouth}</i> mouth</> : null}.</p>
          <div className="dna-moves">{feud.dna.moves.map((m) => <span key={m.slot} title={m.trait}><em>{m.slot}</em>{m.what}</span>)}</div>
          {!!feud.dna.powers?.length && <div className="dna-powers">{feud.dna.powers.map((p) => <span key={p} title={`From ${POWER_CARDS[p]?.from}`}>{POWER_CARDS[p]?.emote} {POWER_CARDS[p]?.name}</span>)}</div>}
        </div>
      )}
      {mine && <p className="live-note">That's you. Tap anywhere on the island to walk, or tap another Chog to play a card on it.</p>}
      {!mine && me?.canPlay && feud && (
        <div className="live-feud">
          <div className="live-feud-top"><span>Your feud</span><b className={`stage s${feud.stage}`}>{feud.name}</b></div>
          <div className="heat"><i style={{ width: `${feud.heat}%` }} /></div>
          {feud.log.length > 0 && <p className="live-note">“{feud.log[feud.log.length - 1]}”</p>}
        </div>
      )}
      {!mine && playing && (
        <div className="live-cards">
          {CARDS.map((k) => (
            <button key={k.key} className={`live-cardbtn${k.key === "challenge" ? " wide" : ""}`} disabled={busy || (k.key === "challenge" && (feud?.stage ?? 0) < need) || !!live?.main && !live.main.done}
              onClick={() => play(k.key)} onPointerEnter={() => setHint(k.what)} onFocus={() => setHint(k.what)} title={k.what}>
              <span className="e">{k.emote}</span><b>{k.name}</b>
            </button>
          ))}
        </div>
      )}
      {!mine && playing && !!me?.powers?.length && (
        <div className="live-cards powers">
          {me.powers.map((k) => {
            const pc = POWER_CARDS[k]; if (!pc) return null;
            const mainOn = !!live?.main && !live.main.done;
            const fighter = mainOn && (live!.main!.a.id === id || live!.main!.b.id === id);
            const off = busy || (k === "haunt" && !live?.night) || ((k === "pump" || k === "dump") ? !fighter : mainOn);
            return (
              <button key={k} className="live-cardbtn power" disabled={off} onClick={() => play(k)} onPointerEnter={() => setHint(`${pc.what} (from your ${pc.from})`)} title={pc.what}>
                <span className="e">{pc.emote}</span><b>{pc.name}</b>
              </button>
            );
          })}
        </div>
      )}
      {!mine && playing && (
        <p className="live-note hint">{busy ? "Walking over…" : hint ?? ((feud?.stage ?? 0) < need ? (me?.holder ? "👑 Holders can Challenge from Side-eye. One roast gets you there." : "Roast or spread rumours to reach Beef. Then you can Challenge.") : "It's on. Challenge them to the Main Event.")}</p>
      )}
      {!mine && me?.canPlay && !playing && <p className="live-note">Bring your Chog onto the island first (button at the top).</p>}
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
      {!mine && !taken && !playing && (me?.judge || (me?.held?.ids ?? []).includes(id)) && (
        <button className="btn small" disabled={busy} onClick={async () => { setBusy(true); await onPlayAs(id); setBusy(false); onClose(); }}>{me?.judge ? "🎫 " : "👑 "}Play as {c.name}</button>
      )}
      {!me?.canPlay && !me?.judge && !(me?.held?.ids ?? []).includes(id) && (
        <button className="btn small ghost" onClick={() => { onClose(); onSignIn(); }}>👑 Hold a Chog? Sign in to play</button>
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
      {!me?.canPlay && !me?.judge && <><span>👀 You're watching live</span><button className="btn small" onClick={onSignIn}>Have a Chog? Sign in 👑</button></>}
      {me?.judge && !me.canPlay && <span>🎫 Judge pass: tap any Chog to play as it</span>}
      {me?.canPlay && !playing && <><span>Play as <b>{name ?? `#${me.tokenId}`}</b>?</span><button className="btn small" onClick={onJoin}>Bring it onto the island</button></>}
      {playing && <Shout />}
      {playing && <><span className="dot" />{me?.holder && <span className="perk-tag">👑 Holder</span>}{me?.judge && <span className="perk-tag">🎫 Judge</span>}<span><b>{name ?? "Your Chog"}</b> is live<span className="hide-m">. Tap the island to walk, tap a Chog for cards.</span><span className="show-m"> · tap to walk</span></span><button className="btn small ghost" onClick={onLeave}>Switch</button></>}
    </div>
  );
}

export function FeudTicker({ live }: { live: LiveView | null }) {
  if (!live?.feuds.length && !live?.crown) return null;
  return (
    <div className="feuds glass" aria-label="Hottest feuds on the island">
      {live.crown && <div className="crown-row">👑 <span>Chog of the Day</span><b>{live.crown.name}</b></div>}
      {!!live.feuds.length && <div className="eyebrow">Hot feuds</div>}
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
  // ringside: a commentator line and the crowd reacting, both driven by the fight's own moments
  const [call, setCall] = useState<string>("");
  const [bursts, setBursts] = useState<{ id: number; x: number; e: string }[]>([]);
  const burst = (n: number, set: string[]) => setBursts((b) => [...b.slice(-40), ...Array.from({ length: n }, (_, i) => ({ id: Date.now() + i + Math.random(), x: 4 + Math.random() * 92, e: set[Math.floor(Math.random() * set.length)] }))]);
  useEffect(() => { if (!bursts.length) return; const t = setTimeout(() => setBursts((b) => b.slice(Math.min(b.length, 8))), 1600); return () => clearTimeout(t); }, [bursts]);
  useEffect(() => {
    if (!started || ended || !canvas.current) return;
    let g: { dispose(): void; state(): { clock: number; P: { dmg: number; stocks: number }[] } } | null = null, alive = true;
    const nameOf = (side: number) => (side === 0 ? m.a.name : m.b.name);
    const pickOne = (a: string[]) => a[Math.floor(Math.random() * a.length)];
    let lastCall = 0;
    const say = (t: string, force = false) => { if (!force && Date.now() - lastCall < 1400) return; lastCall = Date.now(); setCall(t); };
    import("@/arena/rumble").then(({ createRumble }) => {
      if (!alive || !canvas.current) return;
      g = createRumble({
        canvas: canvas.current, me: m.a, foe: m.b, auto: true, seed: m.seed, startAt: local(m.startAt), spectate: true,
        onEnd: (r: { won: boolean }) => { setLocalWinner(r.won ? "a" : "b"); setEnded(true); burst(40, ["🎉", "🎊", "✨", "👑", "🔥"]); },
        onEvent: (e: { type: string; side?: number; left?: number }) => {
          // a late joiner fast-forwards through the fight: stay quiet until it's caught up
          if (Date.now() - local(m.startAt) > 0 && caughtUp === false) return;
          const v = nameOf(e.side ?? 0), o = nameOf(1 - (e.side ?? 0));
          if (e.type === "go") { say(`And we're LIVE! ${m.a.name} versus ${m.b.name}!`, true); burst(10, ["👏", "📣", "🔥"]); }
          if (e.type === "smash") { say(pickOne([`OOF. ${v} felt that one!`, `${v} takes a monster hit!`, `${o} is putting on a show!`])); burst(6, ["😱", "🔥", "💥"]); }
          if (e.type === "crit") say(`Lucky crit from ${v}!`);
          if (e.type === "ringout") { say(`RING OUT! ${v} is off the stage!`, true); burst(16, ["😱", "🤯", "📣", "🔥"]); }
          if (e.type === "stock" && e.left === 1) say(`Last life for ${v}! The crowd is on its feet!`, true);
          if (e.type === "frog") { say(`FROG DAD has entered the arena for ${v}!`, true); burst(10, ["🐸"]); }
        },
      });
    });
    // once the replay has caught up with the clock, the commentary switches on
    let caughtUp = false;
    const t = setTimeout(() => { caughtUp = true; }, Math.max(0, Date.now() - local(m.startAt) > 2000 ? 1200 : 0));
    let said30 = false; const danger = [false, false];
    const poll = setInterval(() => {
      const s = g?.state(); if (!s) return;
      if (!said30 && s.clock <= 30 && s.clock > 0) { said30 = true; say("Thirty seconds left!", true); }
      s.P.forEach((p, i) => { if (p.dmg >= 100 && !danger[i]) { danger[i] = true; say(`${nameOf(i)} is in the danger zone at ${Math.round(p.dmg)}%!`); } if (p.dmg < 30) danger[i] = false; });
    }, 700);
    return () => { alive = false; clearTimeout(t); clearInterval(poll); g?.dispose(); };
  }, [started, ended, m.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const pool = m.pool ?? { a: 100, b: 100 }, share = Math.round(pool.a / (pool.a + pool.b) * 100);
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
          {!ended && call && <div className="main-call" key={call}>🎙️ {call}</div>}
          {!ended && (
            <div className="main-pool" title="Chips bet on each side at the Lucky Lilypad">
              <span>{m.a.name}</span><div className="split"><i style={{ width: `${share}%` }} /></div><span>{m.b.name}</span>
              <em>{(pool.a + pool.b).toLocaleString()} chips in the pool</em>
            </div>
          )}
          <div className="crowd-bursts" aria-hidden="true">{bursts.map((b) => <i key={b.id} style={{ left: `${b.x}%` }}>{b.e}</i>)}</div>
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

/** Say your own line: your Chog shouts it to the whole town. */
function Shout() {
  const [t, setT] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); if (!t.trim() || busy) return;
    setBusy(true); setErr("");
    try { await api("/api/live/act", { kind: "shout", text: t }); setT(""); } catch (x) { setErr(errMsg(x)); setTimeout(() => setErr(""), 2500); }
    setBusy(false);
  };
  return (
    <form className="shout" onSubmit={send} onClick={(e) => e.stopPropagation()}>
      <input value={t} maxLength={80} placeholder={err || "📣 Shout something…"} aria-label="Shout something to the town" onChange={(e) => setT(e.target.value)} className={err ? "err" : ""} />
      <button className="btn small" disabled={busy || !t.trim()}>Say</button>
    </form>
  );
}
