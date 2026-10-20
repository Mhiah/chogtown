"use client";

import { useCallback, useEffect, useState } from "react";
import type { Shell } from "../types";
import { api, errMsg } from "../client";
import RumbleOverlay, { type Fighter } from "../RumbleOverlay";

type Side = { id: number; who: string; type: string; line: string; votes: number };
type D = { day: string; topic: string; a: Side; b: Side; mine: "a" | "b" | null; settled: boolean; winner: "a" | "b" | null };
type Opp = { why: string; kind: "rival" | "challenger" | "champion"; f: Fighter };
type ArenaData = { me: Fighter | null; opponents?: Opp[]; ranked?: boolean; left?: number };

export default function ArenaPanel({ shell }: { shell: Shell }) {
  const [tab, setTab] = useState<"rumble" | "debate">("rumble");
  return (
    <>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "rumble"} onClick={() => setTab("rumble")}>Rumble</button>
        <button role="tab" aria-selected={tab === "debate"} onClick={() => setTab("debate")}>Tonight&apos;s debate</button>
      </div>
      {tab === "rumble" ? <Rumble shell={shell} /> : <Debate shell={shell} />}
    </>
  );
}

const KIND: Record<Opp["kind"], string> = { rival: "Rival", challenger: "Challenger", champion: "Champion" };

function Rumble({ shell }: { shell: Shell }) {
  const [d, setD] = useState<ArenaData | null>(null);
  const [err, setErr] = useState("");
  const [fight, setFight] = useState<{ foe: Fighter; why: string } | null>(null);
  const [num, setNum] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { api<ArenaData>("/api/arena").then(setD).catch((e) => setErr(errMsg(e))); }, []);
  useEffect(() => { load(); }, [load, shell.me?.tokenId]);

  if (err && !shell.me?.canPlay) return (
    <>
      <p className="sub">Every Chog fights with what it was minted with. Its eyes are its attack, its mouth is its special, its head is its dash. Knock the other Chog off the stage three times.</p>
      <div className="card"><p className="note" style={{ margin: 0 }}>👀 Fights are for holders. Sign in with your Chog in Your Chogmate to fight. Everyone can watch the Main Events, which the whole town sees live.</p></div>
    </>
  );
  if (err) return <p className="err">{err}</p>;
  if (!d) return <p className="sub">Sweeping the stage…</p>;
  if (!d.me) return (
    <>
      <p className="sub">Every Chog fights with what it was minted with. Its eyes are its attack, its mouth is its special, its head is its dash. Knock the other Chog off the stage three times.</p>
      <div className="card"><p className="note" style={{ margin: 0 }}>Sign in with your Chog in Your Chogmate to fight. No Chog? You can still watch every Main Event live.</p></div>
    </>
  );
  const callout = async () => {
    if (!num) return; setBusy(true);
    try { const r = await api<{ foe: Fighter }>("/api/arena/callout", { tokenId: Number(num) }); setFight({ foe: r.foe, why: "You called them out." }); }
    catch (e) { shell.toast(errMsg(e)); }
    setBusy(false);
  };
  const me = d.me;
  return (
    <>
      <div className="card rumble-me">
        <div className="row">
          <img className="rumble-face" src={me.image} alt="" />
          <div style={{ flex: 1 }}>
            <b>{me.label}</b>
            <div className="k">{me.archetypeName} · {me.record.w}–{me.record.l}{me.record.streak > 1 ? ` · ${me.record.streak} in a row` : ""}</div>
          </div>
        </div>
        <ul className="kit">{me.lines.map((l) => <li key={l.slot}><span className="k">{l.slot}</span><span>{l.what}</span></li>)}</ul>
        <p className="note" style={{ margin: 0 }}>{d.ranked ? `${d.left} ranked fight${d.left === 1 ? "" : "s"} left today. Wins climb the Palace of Legends and make the Gazette.` : "Guest fights are exhibitions. Only an owner's fights are recorded."}</p>
      </div>
      {d.opponents?.map((o) => (
        <div className="card opp" key={o.f.id}>
          <div className="row">
            <img className="rumble-face" src={o.f.image} alt="" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="k">{KIND[o.kind]} · {o.f.archetypeName}</div>
              <b>{o.f.label}</b>
              <div className="k ell">{o.why}</div>
            </div>
            <button className="btn violet" onClick={() => setFight({ foe: o.f, why: o.why })}>Fight</button>
          </div>
          <p className="quote">“{o.f.taunt}”</p>
        </div>
      ))}
      <div className="card">
        <div className="k">Call out any Chog</div>
        <form className="field" onSubmit={(e) => { e.preventDefault(); callout(); }}>
          <label className="sr" htmlFor="callout">Chog number</label>
          <input id="callout" inputMode="numeric" placeholder="1 to 1969" value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          <button className="btn violet" disabled={busy || !num}>{busy ? "…" : "Call out"}</button>
        </form>
      </div>
      <p className="note">Move WASD or arrows · J or click: eyes · K or right click: mouth · Space: dash. On a phone, drag the left side and tap the buttons.</p>
      {fight && <RumbleOverlay me={me} foe={fight.foe} why={fight.why} ranked={!!d.ranked && (d.left ?? 0) > 0}
        onClose={(changed) => { setFight(null); if (changed) load(); }} toast={shell.toast} />}
    </>
  );
}

function Debate({ shell }: { shell: Shell }) {
  const [d, setD] = useState<D | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ debate: D | null }>("/api/debate").then((r) => setD(r.debate)).catch(() => setD(null)); }, []);
  if (d === undefined) return <p className="sub">Setting up tonight&apos;s stage…</p>;
  if (!d) return <p className="sub">No debate tonight. The stage crew is on strike.</p>;
  const tot = d.a.votes + d.b.votes;
  const pct = (s: Side) => (tot ? Math.round((s.votes / tot) * 100) : 0);
  const vote = async (s: "a" | "b") => {
    if (busy) return; setBusy(true);
    try { const r = await api<{ debate: D }>("/api/debate", { side: d.mine === s ? null : s }); setD(r.debate); if (r.debate.mine) shell.toast("Vote counted."); }
    catch (e) { shell.toast(errMsg(e)); }
    setBusy(false);
  };
  return (
    <>
      <div className="card"><div className="k">Tonight&apos;s debate · voting closes at midnight UTC</div><p className="topic">{d.topic}</p></div>
      {(["a", "b"] as const).map((k) => {
        const s = d[k];
        const mine = shell.me?.tokenId === s.id;
        return (
          <div className="card" key={k}>
            <div className="row"><div><b>{s.who}</b>{mine && <span className="k"> · yours</span>}<div className="k">{s.type}</div></div><span className="k num">{s.votes} vote{s.votes === 1 ? "" : "s"}</span></div>
            <p className="quote">“{s.line}”</p>
            <button className="vote" aria-pressed={d.mine === k} onClick={() => vote(k)} disabled={d.settled}>
              <em style={{ width: `${d.mine ? pct(s) : 0}%` }} />
              <span>{d.mine === k ? "Your vote" : `Vote for ${s.who.split(" #")[0]}`}</span>
              <span className="num">{d.mine ? `${pct(s)}%` : ""}</span>
            </button>
          </div>
        );
      })}
      <p className="note">Winners climb the Palace of Legends and get a confidence boost. Losers get roasted in tomorrow&apos;s Gazette.</p>
    </>
  );
}
