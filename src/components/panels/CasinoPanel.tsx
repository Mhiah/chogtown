"use client";

import { useEffect, useRef, useState } from "react";
import type { Shell } from "../types";
import { api, errMsg } from "../client";
import { sfx } from "@/arena/sfx";

/** The Lucky Lilypad: Chog Slots, the Main Event book and the high rollers. Play chips only. */

type Sym = "frog" | "crown" | "cap" | "heart" | "glasses" | "jeet";
const ORDER: Sym[] = ["frog", "crown", "cap", "heart", "glasses", "jeet"];
const PAYS: { s: Sym; x: number }[] = [{ s: "frog", x: 50 }, { s: "crown", x: 20 }, { s: "cap", x: 10 }, { s: "heart", x: 8 }, { s: "glasses", x: 5 }];
const EMOJI: Record<Exclude<Sym, "jeet">, string> = { frog: "🐸", crown: "👑", cap: "🧢", heart: "💜", glasses: "🕶️" };
const Face = ({ s }: { s: Sym }) => (s === "jeet" ? <img src="/toy/jeet.webp" alt="jeet" /> : <span>{EMOJI[s]}</span>);

type Info = { chips: number; topUp: number; spins: number; best: number; bets: number[]; start: number; daily: number; board: { name: string; chips: number; best: number; jackpots: number }[]; myBet: { id: string; side: "a" | "b"; amount: number } | null; perks?: { nfts: number; chog: number; tierName: string | null; daily: number; highRoller: boolean } };

export default function CasinoPanel({ shell }: { shell: Shell }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [tab, setTab] = useState<"slots" | "book" | "board">("slots");
  const toast = useRef(shell.toast); toast.current = shell.toast;
  const load = () => api<Info>("/api/casino").then((d) => { setInfo(d); if (d.topUp) toast.current(`+${d.topUp} chips: ${d.topUp === d.start ? "welcome to the Lucky Lilypad" : "your daily top-up"}.`); }).catch((e) => toast.current(errMsg(e)));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!info) return <p className="sub">Shuffling the chips…</p>;
  const setChips = (chips: number) => setInfo((i) => (i ? { ...i, chips } : i));
  const main = shell.live?.main;
  return (
    <>
      <div className="chips-bar"><span className="coin">🪙</span><b>{info.chips.toLocaleString()}</b><span>chips</span><em>Play chips only · +{info.daily} every day</em></div>
      <Perks p={info.perks} signedIn={!!shell.me?.address} />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "slots"} onClick={() => setTab("slots")}>Chog Slots</button>
        <button role="tab" aria-selected={tab === "book"} onClick={() => setTab("book")}>Main Event{main && !main.done ? " 🔴" : ""}</button>
        <button role="tab" aria-selected={tab === "board"} onClick={() => { setTab("board"); load(); }}>High rollers</button>
      </div>
      {tab === "slots" && <Slots chips={info.chips} bets={info.bets} onChips={setChips} toast={shell.toast} />}
      {tab === "book" && <Book shell={shell} chips={info.chips} bets={info.bets} onChips={setChips} saved={info.myBet} />}
      {tab === "board" && (
        <div className="card" style={{ gap: 0, paddingBlock: 4 }}>
          {info.board.length === 0 ? <p className="note" style={{ padding: "12px 0" }}>Nobody's played yet. The tables are warm.</p> :
            info.board.map((r, i) => <div key={r.name + i} className="rank"><span className="n">{i + 1}</span><span>{r.name}{r.jackpots ? " 🐸" : ""}</span><span className="num">{r.chips.toLocaleString()}</span></div>)}
        </div>
      )}
      <p className="note">Chips are just for fun: nothing to buy, nothing to cash out. Frog Dad jackpots make the Gazette.</p>
    </>
  );
}

function Slots({ chips, bets, onChips, toast }: { chips: number; bets: number[]; onChips(n: number): void; toast(t: string): void }) {
  const [bet, setBet] = useState(25);
  const [reels, setReels] = useState<Sym[]>(["frog", "crown", "cap"]);
  const [spinning, setSpinning] = useState<boolean[]>([false, false, false]);
  const [res, setRes] = useState<{ win: number; line: string; x: number } | null>(null);
  const busy = spinning.some(Boolean);
  const stopped = useRef(3); // reels to the left of this have landed
  const go = async () => {
    if (busy) return;
    setRes(null); setSpinning([true, true, true]); stopped.current = 0;
    const tick = setInterval(() => { sfx.tick(); setReels((r) => r.map((s, i) => (i < stopped.current ? s : ORDER[(ORDER.indexOf(s) + 1 + i) % ORDER.length]))); }, 70);
    try {
      const r = await api<{ reels: Sym[]; x: number; win: number; line: string; chips: number }>("/api/casino", { kind: "spin", bet });
      // stop the reels one at a time
      for (let i = 0; i < 3; i++) {
        await new Promise((ok) => setTimeout(ok, 380 + i * 260));
        stopped.current = i + 1;
        setSpinning((sp) => sp.map((v, j) => (j === i ? false : v)));
        setReels((cur) => cur.map((s, j) => (j <= i ? r.reels[j] : s)));
      }
      clearInterval(tick);
      setReels(r.reels); setRes(r); onChips(r.chips);
      if (r.x === 50) { sfx.jackpot(); toast("FROG DAD JACKPOT! The whole island heard that."); }
      else if (r.win > 0) (r.x >= 5 ? sfx.win : sfx.coins)();
    } catch (e) { clearInterval(tick); stopped.current = 3; setSpinning([false, false, false]); toast(errMsg(e)); }
  };
  return (
    <div className="card slots">
      <div className={`reels${res?.x === 50 ? " jackpot" : res && res.win > 0 ? " won" : ""}`}>
        {reels.map((s, i) => <div key={i} className={`reel${spinning[i] ? " spin" : ""}`}><Face s={s} /></div>)}
      </div>
      <div className="slot-line">{res ? <>{res.line} {res.win > 0 ? <b>+{res.win.toLocaleString()}</b> : <span>−{bet}</span>}</> : busy ? "Spinning…" : "Three of a kind pays big. Frog Dad pays biggest."}</div>
      <div className="slot-row">
        <div className="bet-pick" role="radiogroup" aria-label="Bet">
          {bets.map((b) => <button key={b} role="radio" aria-checked={bet === b} disabled={busy} onClick={() => setBet(b)}>{b}</button>)}
        </div>
        <button className="btn violet spin-btn" disabled={busy || chips < bet} onClick={go}>{busy ? "…" : `Spin ${bet}`}</button>
      </div>
      <div className="paytable">
        {PAYS.map((p) => <span key={p.s}><Face s={p.s} /><Face s={p.s} /><Face s={p.s} /><b>×{p.x}</b></span>)}
        <span className="wide">Any pair <b>×2</b> · a 🐸 anywhere gives your bet back · <img src="/toy/jeet.webp" alt="" /> never pays</span>
      </div>
    </div>
  );
}

function Book({ shell, chips, bets, onChips, saved }: { shell: Shell; chips: number; bets: number[]; onChips(n: number): void; saved: Info["myBet"] }) {
  const m = shell.live?.main;
  const [amount, setAmount] = useState(25);
  const [mine, setMine] = useState<{ side: "a" | "b"; amount: number } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setMine(saved && saved.id === m?.id ? saved : null), [m?.id, saved]);
  if (!m || m.done) {
    const hot = shell.live?.feuds?.[0];
    return (
      <div className="card book-empty">
        <img src="/toy/fight.webp" alt="" />
        <p><b>No Main Event on the board right now.</b><br />The bell rings every few minutes for the hottest feud{hot ? `, and right now that's ${hot.an} vs ${hot.bn}` : ""}. Bets open the moment it does.</p>
        {m?.done && m.winner && <p className="note">Last result: {(m.winner === "a" ? m.a : m.b).name} won.</p>}
      </div>
    );
  }
  const pool = m.pool ?? { a: 100, b: 100 }, total = pool.a + pool.b;
  const open = Date.now() - (shell.offset ?? 0) < m.startAt + 10_000;
  const bet = async (side: "a" | "b") => {
    setBusy(true);
    try {
      const r = await api<{ chips: number; bet: { side: "a" | "b"; amount: number } }>("/api/casino", { kind: "bet", side, amount });
      onChips(r.chips); setMine(r.bet); shell.toast(`${amount} chips on ${(side === "a" ? m.a : m.b).name}.`);
    } catch (e) { shell.toast(errMsg(e)); }
    setBusy(false);
  };
  return (
    <div className="card book">
      <div className="book-head">🔔 Main Event · {open ? "bets open" : "bets closed"}</div>
      <div className="book-sides">
        {(["a", "b"] as const).map((side) => {
          const f = side === "a" ? m.a : m.b, odds = total / pool[side];
          return (
            <div key={side} className={`book-side${mine?.side === side ? " mine" : ""}`}>
              <img src={f.image} alt="" />
              <b>{f.name}</b>
              <em>{f.archetypeName} · {f.record.w}–{f.record.l}</em>
              <div className="odds">pays ×{odds.toFixed(2)}</div>
              <div className="pool">{pool[side].toLocaleString()} chips on</div>
              <button className="btn small" disabled={busy || !open || chips < amount || (!!mine && mine.side !== side)} onClick={() => bet(side)}>Back {f.name}</button>
            </div>
          );
        })}
      </div>
      <div className="bet-pick" role="radiogroup" aria-label="Bet size">
        {bets.map((b) => <button key={b} role="radio" aria-checked={amount === b} onClick={() => setAmount(b)}>{b}</button>)}
      </div>
      <p className="note">{mine ? `Your bet: ${mine.amount} on ${(mine.side === "a" ? m.a : m.b).name}. Winners split the whole pool.` : "Winners split the whole pool. The odds move as people bet."}</p>
    </div>
  );
}

/** What your wallet unlocks here: Chog NFT holders and $CHOG holders get the high-roller table and more daily chips. */
function Perks({ p, signedIn }: { p?: Info["perks"]; signedIn: boolean }) {
  if (!signedIn) return <p className="note perks-note">👑 Hold a Chog or $CHOG? Sign in with your wallet for the 250 and 500 tables and bigger daily chips: +200, +500 or +1,500 a day depending on your $CHOG.</p>;
  if (!p) return null;
  const bits = [p.nfts ? `👑 ${p.nfts} Chog${p.nfts === 1 ? "" : "s"}` : null, p.tierName ? `🪙 ${p.tierName} · ${p.chog.toLocaleString()} $CHOG` : null].filter(Boolean);
  if (!bits.length) return <p className="note perks-note">No Chog or $CHOG in this wallet yet. Holders get the high-roller table and up to +1,500 chips a day.</p>;
  return <div className="perks-row">{bits.map((b) => <span key={b} className="perk-tag">{b}</span>)}{p.highRoller && <span className="perk-tag">High-roller table open</span>}{p.daily > 0 && <span className="perk-tag">+{p.daily} daily</span>}</div>;
}
