"use client";

import { useEffect, useRef, useState } from "react";
import type { Shell, ChogView } from "../types";
import { api, hasWallet, signIn, errMsg } from "../client";
import { ChogFace } from "../icons";

const STATS: [keyof ChogView["stats"], string][] = [["warmth", "Warmth"], ["confidence", "Confidence"], ["chaos", "Chaos"], ["trust", "Trust"], ["curiosity", "Curiosity"]];
type Msg = { role: "user" | "chog"; text: string };

export default function HomePanel({ shell }: { shell: Shell }) {
  const { me } = shell;
  if (!me) return <p className="sub">Opening the gates…</p>;
  if (!me.tokenId) return me.address ? <PickChog shell={shell} /> : <SignIn shell={shell} />;
  return <Chogmate shell={shell} id={me.tokenId} />;
}

function SignIn({ shell }: { shell: Shell }) {
  const [busy, setBusy] = useState<"" | "wallet" | "guest">("");
  const [err, setErr] = useState("");
  const go = async () => {
    setErr(""); setBusy("wallet");
    try { await signIn(); await shell.refreshMe(); shell.toast("Signed in. Now pick your Chog."); }
    catch (e) { setErr((e as { code?: number })?.code === 4001 ? "You cancelled the signature. No problem, try again when ready." : errMsg(e)); }
    setBusy("");
  };
  const [visit, setVisit] = useState("");
  const guest = async (tokenId?: number) => {
    setBusy("guest");
    try { await api("/api/auth/guest", tokenId ? { tokenId } : {}); await shell.refreshMe(); } catch (e) { setErr(errMsg(e)); }
    setBusy("");
  };
  return (
    <>
      <p className="sub">Your Chog lives here. Sign in with the wallet that holds it and it will remember you, grow from how you treat it, and tell you what happened in town every morning.</p>
      <div className="card">
        <div className="k">Hold a Chog?</div>
        <button className="btn block" onClick={go} disabled={!!busy}>{busy === "wallet" ? "Check your wallet…" : "Connect wallet"}</button>
        <p className="note">{hasWallet() ? "You'll sign a free message on Monad. No transaction, no gas." : "No wallet found in this browser. Open Chogtown inside your wallet app, or install a wallet extension."}</p>
        {err && <p className="err">{err}</p>}
      </div>
      <div className="card">
        <div className="k">Just looking?</div>
        <button className="btn ghost block" onClick={() => guest()} disabled={!!busy}>{busy === "guest" ? "Opening…" : "Look around as a guest"}</button>
        <form className="field" onSubmit={(e) => { e.preventDefault(); if (visit) guest(Number(visit)); }}>
          <label className="sr" htmlFor="visit-num">Visit any Chog by number</label>
          <input id="visit-num" inputMode="numeric" placeholder="or visit any Chog, 1 to 1969" value={visit} onChange={(e) => setVisit(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          <button className="btn violet" disabled={!!busy || !visit}>Visit</button>
          <button type="button" className="btn ghost" disabled={!!busy} onClick={() => guest(1 + Math.floor(Math.random() * 1969))}>Random</button>
        </form>
        <p className="note">Chat with any of the 1,969 Chogs and take it into the Amphitheatre. Only owners can shape a Chog or keep a streak.</p>
      </div>
    </>
  );
}

function PickChog({ shell }: { shell: Shell }) {
  const { me } = shell;
  const [num, setNum] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pick = async (id: number | string) => {
    setErr(""); setBusy(true);
    try { const r = await api<{ chog: ChogView }>("/api/me/chog", { tokenId: Number(id) }); shell.setChog(r.chog); await shell.refreshMe(); shell.toast(`${r.chog.name} is awake.`); shell.bounce(); }
    catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  };
  const ids = me?.held?.ids;
  return (
    <>
      <p className="sub">{me?.held ? (me.held.balance ? `This wallet holds ${me.held.balance} Chog${me.held.balance === 1 ? "" : "s"}. Which one is coming home?` : "This wallet doesn't hold a Chog yet. You can still look around as a guest.") : "Which Chog is yours? We'll check on Monad."}</p>
      {ids && ids.length > 0 && <div className="card"><div className="k">Your Chogs</div><div className="chips">{ids.map((i) => <button key={i} className="chip" disabled={busy} onClick={() => pick(i)}>Chog #{i}</button>)}</div></div>}
      <div className="card">
        <div className="k">Chog number</div>
        <form className="field" onSubmit={(e) => { e.preventDefault(); if (num) pick(num); }}>
          <label className="sr" htmlFor="chog-num">Chog number</label>
          <input id="chog-num" inputMode="numeric" placeholder="e.g. 1204" value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, ""))} />
          <button className="btn violet" disabled={busy || !num}>{busy ? "Checking…" : "Go"}</button>
        </form>
        {err && <p className="err">{err}</p>}
      </div>
      <SignOut shell={shell} />
    </>
  );
}

function SignOut({ shell }: { shell: Shell }) {
  return <button className="linkish" onClick={async () => { await api("/api/auth/logout", {}); shell.setChog(null); await shell.refreshMe(); }}>Sign out</button>;
}

function weekStrip(days: string[]) {
  const out: { label: string; on: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5);
    const key = d.toISOString().slice(0, 10);
    out.push({ label: "SMTWTFS"[d.getUTCDay()], on: days.includes(key) });
  }
  return out;
}

function Chogmate({ shell, id }: { shell: Shell; id: number }) {
  const { chog, me } = shell;
  const [names, setNames] = useState<Record<number, string>>({});
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [greet, setGreet] = useState("");
  const [left, setLeft] = useState(40);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [err, setErr] = useState("");
  const [imgOk, setImgOk] = useState(true);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ chog: ChogView; names: Record<number, string>; chat: { messages: Msg[]; greeting: string; left: number } | null }>(`/api/chog/${id}`)
      .then((d) => { shell.setChog(d.chog); setNames(d.names); if (d.chat) { setMsgs(d.chat.messages); setGreet(d.chat.greeting); setLeft(d.chat.left); } })
      .catch((e) => setErr(errMsg(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" }); }, [msgs, typing]);

  if (!chog || chog.id !== id) return err ? <p className="err">{err}</p> : <p className="sub">Waking your Chog…</p>;

  const today = new Date().toISOString().slice(0, 10);
  const checked = chog.streak.last === today;
  const checkIn = async () => {
    try {
      const r = await api<{ already: boolean; streak: number; sulk?: boolean; chog: ChogView }>(`/api/chog/${id}/checkin`, {});
      shell.setChog(r.chog); shell.bounce();
      shell.toast(r.sulk ? `${chog.name} sulked a bit about the missed day. Streak restarted.` : `Checked in. ${r.streak} day streak.`);
    } catch (e) { shell.toast(errMsg(e)); }
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = text.trim(); if (!v || typing) return;
    setText(""); setMsgs((m) => [...m, { role: "user", text: v }]); setTyping(true);
    try {
      const r = await api<{ reply: string; stats: ChogView["stats"]; limited: boolean }>(`/api/chog/${id}/chat`, { message: v });
      setMsgs((m) => [...m, { role: "chog", text: r.reply }]);
      if (!me?.guest) shell.setChog({ ...chog, stats: r.stats });
      setLeft((l) => Math.max(0, l - 1)); shell.bounce();
    } catch (e) { setMsgs((m) => [...m, { role: "chog", text: errMsg(e) }]); }
    setTyping(false);
  };
  const rels = chog.relations.filter((r) => r.kind !== "neutral");

  return (
    <>
      {me?.guest && <p className="note">You're a guest, visiting {chog.name}. Chats are just for fun here: only its owner shapes who it becomes.</p>}
      <div className="card">
        <div className="who">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="avatar">{chog.image && imgOk ? <img src={`/api/chog/${chog.id}/image`} alt={`${chog.nftName} NFT`} onError={() => setImgOk(false)} /> : <ChogFace />}</div>
          <div><h3>{chog.name} <span className="k num">#{chog.id}</span></h3><div className="k">{chog.archetype} · {chog.flavor} · {chog.district}</div></div>
        </div>
        <p className="sub">{chog.backstory}</p>
      </div>

      {chog.report && (
        <div className="card">
          <div className="k">Morning report{chog.report.with && names[chog.report.with] ? ` · with ${names[chog.report.with]}` : ""}</div>
          <p className="report">“{chog.report.text}”</p>
        </div>
      )}

      {!me?.guest && (
        <div className="card">
          <div className="row">
            <div><div className="k">Daily check-in</div><div style={{ fontWeight: 700, fontSize: 22, letterSpacing: "-.02em" }}><span className="num">{chog.streak.count}</span> day streak</div></div>
            <button className="btn" onClick={checkIn} disabled={checked}>{checked ? "Checked in" : "Check in"}</button>
          </div>
          <div className="streak">{weekStrip(chog.streak.days).map((d, i) => <div key={i} className={d.on ? "on" : ""}>{d.label}</div>)}</div>
          <p className="note">Keep the streak and {chog.name} warms up to you. Miss a day and it sulks.</p>
        </div>
      )}

      <div className="card">
        <div className="row"><div className="k">Who it is becoming</div><div className="k">{chog.mood}</div></div>
        {STATS.map(([k, n]) => {
          const d = chog.delta[k];
          return (
            <div className="stat" key={k}>
              <span>{n}</span><div className="bar"><i style={{ width: `${chog.stats[k]}%` }} /></div>
              <span className={`delta ${d > 0 ? "up" : ""}`}>{d ? `${d > 0 ? "+" : ""}${d} wk` : "steady"}</span>
            </div>
          );
        })}
        {rels.length > 0 && <div className="rel">{rels.map((r) => <span key={r.id} className={r.kind}>{r.kind === "friend" ? "Friend" : "Rival"}: {names[r.id] ?? `#${r.id}`}</span>)}</div>}
        {chog.moments[0] && <p className="note">Never forgets: {chog.moments[0].text}</p>}
      </div>

      <div className="card">
        <div className="row"><div className="k">Chat</div><div className="k num">{left} left today</div></div>
        <div className="chat" ref={chatRef}>
          {msgs.length === 0 && greet && <div className="msg chog">{greet}</div>}
          {msgs.map((m, i) => <div key={i} className={`msg ${m.role === "user" ? "me" : "chog"}`}>{m.text}</div>)}
          {typing && <div className="msg chog typing">{chog.name} is typing…</div>}
        </div>
        <form className="say" onSubmit={send}>
          <label className="sr" htmlFor="say-in">Message {chog.name}</label>
          <input id="say-in" placeholder={`Say something to ${chog.name}`} autoComplete="off" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn violet" type="submit" disabled={typing || !text.trim()}>Send</button>
        </form>
        {!me?.ai && <p className="note">Running without the AI key, so replies come from a small script.</p>}
      </div>
      <SignOut shell={shell} />
    </>
  );
}
