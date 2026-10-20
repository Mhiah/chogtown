"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import FaceBooth from "../FaceBooth";
import type { Shell, ChogView } from "../types";
import { api } from "../client";
import { hats, auras } from "@/town/scene";

const FACE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M16 3l3 5 5-3-1 6 6 1-4 4 4 4-6 1 1 5-5-2-3 5-3-5-5 2 1-5-6-1 4-4-4-4 6-1-1-6 5 3z" fill="#5b3ab8"/><ellipse cx="16" cy="17.5" rx="7" ry="6" fill="#fff2d8"/><path d="M12 12l2 3 2-3 2 3 2-3v-2h-8z" fill="#5b3ab8"/><ellipse cx="13.4" cy="17.3" rx="1.3" ry="1.8" fill="#14091f"/><ellipse cx="18.6" cy="17.3" rx="1.3" ry="1.8" fill="#14091f"/><circle cx="13.8" cy="16.6" r=".45" fill="#fff"/><circle cx="19" cy="16.6" r=".45" fill="#fff"/><circle cx="11.2" cy="19.6" r="1.1" fill="#e0507d" opacity=".8"/><circle cx="20.8" cy="19.6" r="1.1" fill="#e0507d" opacity=".8"/><path d="M15.4 19.6h1.2l-.6.7z" fill="#e85a8f"/><path d="M15 21.2q1 .8 2 0" stroke="#2a1450" stroke-width=".8" fill="none" stroke-linecap="round"/></svg>`;

const load = (src: string) => new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

function drawHat(g: CanvasRenderingContext2D, kind: string, cx: number, top: number, w: number) {
  g.save();
  if (kind === "party") {
    const gr = g.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0); gr.addColorStop(0, "#ff9bcb"); gr.addColorStop(1, "#ffad91");
    g.fillStyle = gr; g.beginPath(); g.moveTo(cx - w * 0.32, top + w * 0.05); g.lineTo(cx + w * 0.32, top + w * 0.05); g.lineTo(cx + w * 0.04, top - w * 0.62); g.closePath(); g.fill();
    g.fillStyle = "#f4ce87"; g.beginPath(); g.arc(cx + w * 0.04, top - w * 0.64, w * 0.07, 0, Math.PI * 2); g.fill();
    g.fillRect(cx - w * 0.34, top, w * 0.68, w * 0.06);
  } else if (kind === "crown") {
    g.fillStyle = "#f4ce87"; g.beginPath(); g.moveTo(cx - w * 0.38, top + w * 0.06);
    for (let i = 0; i <= 4; i++) { const x = cx - w * 0.38 + (i * w * 0.76) / 4; g.lineTo(x, top - w * (i % 2 ? 0.16 : 0.34)); if (i < 4) g.lineTo(x + (w * 0.76) / 8, top - w * 0.12); }
    g.lineTo(cx + w * 0.38, top + w * 0.06); g.closePath(); g.fill();
    g.fillStyle = "#79e8ec"; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(cx - w * 0.2 + i * w * 0.2, top - w * 0.02, w * 0.035, 0, Math.PI * 2); g.fill(); }
  } else if (kind === "chef") {
    g.fillStyle = "#fff5e9"; g.fillRect(cx - w * 0.26, top - w * 0.12, w * 0.52, w * 0.16);
    [[-0.18, -0.24], [0.18, -0.24], [0, -0.34], [0, -0.2]].forEach(([dx, dy]) => { g.beginPath(); g.arc(cx + dx * w, top + dy * w, w * 0.17, 0, Math.PI * 2); g.fill(); });
  }
  g.restore();
}

async function drawCard(cv: HTMLCanvasElement, chog: ChogView | null, look: { hat: string; aura: string }) {
  const W = 1080, H = 1350; cv.width = W; cv.height = H;
  const g = cv.getContext("2d")!;
  const aura = auras.find((a) => a[0] === look.aura)?.[2] ?? "#f4ce87";
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#2a1a5e"); bg.addColorStop(1, "#482080"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, 560, 60, W / 2, 560, 520); glow.addColorStop(0, aura + "cc"); glow.addColorStop(1, aura + "00"); g.fillStyle = glow; g.fillRect(0, 0, W, H);
  const img = (chog?.image && (await load(`/api/chog/${chog.id}/image`))) || (await load("data:image/svg+xml;charset=utf-8," + encodeURIComponent(FACE)));
  const S = 720, x = (W - S) / 2, y = 220;
  g.save(); g.shadowColor = aura; g.shadowBlur = 80;
  g.beginPath(); g.roundRect(x, y, S, S, 64); g.fillStyle = "#1b0f3d"; g.fill(); g.restore();
  g.save(); g.beginPath(); g.roundRect(x, y, S, S, 64); g.clip(); if (img) g.drawImage(img, x, y, S, S); g.restore();
  g.lineWidth = 6; g.strokeStyle = aura; g.beginPath(); g.roundRect(x, y, S, S, 64); g.stroke();
  drawHat(g, look.hat, W / 2, y + 40, 360);
  g.fillStyle = "#fff5e9"; g.textAlign = "center";
  g.font = "700 76px -apple-system, 'Helvetica Neue', 'Segoe UI', sans-serif"; g.fillText(chog ? chog.name : "Your Chogmate", W / 2, 1060);
  g.fillStyle = "rgba(240,232,255,.75)"; g.font = "500 36px -apple-system, 'Helvetica Neue', 'Segoe UI', sans-serif";
  g.fillText(chog ? `Chog #${chog.id} · ${chog.archetype} · ${chog.district}` : "Chogtown", W / 2, 1120);
  g.fillStyle = "#f4ce87"; g.font = "600 30px -apple-system, 'Helvetica Neue', 'Segoe UI', sans-serif"; g.fillText("CHOGTOWN", W / 2, 1270);
}

export default function ShopPanel({ shell, goHome }: { shell: Shell; goHome(): void }) {
  const [tab, setTab] = useState<"booth" | "dress">("booth");
  return (
    <>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "booth"} onClick={() => setTab("booth")}>Face Booth</button>
        <button role="tab" aria-selected={tab === "dress"} onClick={() => setTab("dress")}>Dress up</button>
      </div>
      {tab === "booth" ? <Booth shell={shell} goHome={goHome} /> : <DressUp shell={shell} goHome={goHome} />}
    </>
  );
}

function Booth({ shell, goHome }: { shell: Shell; goHome(): void }) {
  const [open, setOpen] = useState(false);
  const [best, setBest] = useState<number | null>(null);
  const id = shell.me?.tokenId ?? null;
  useEffect(() => { fetch("/api/booth", { cache: "no-store" }).then((r) => r.json()).then((d) => setBest(d.record?.best ?? null)).catch(() => {}); }, [open, id]);
  const name = shell.chog?.name ?? (id ? `Chog #${id}` : "a Chog");
  return (
    <>
      <div className="card booth-hero">
        <div className="ico" aria-hidden="true"><img src="/toy/selfie.webp" alt="" /></div>
        <div><b>Your face fires your Chog</b><p className="note" style={{ marginTop: 4 }}>Raise your eyebrows to fire its eyes, open your mouth for its mouth power. 60 seconds of jeets. Your camera never leaves this browser.</p></div>
      </div>
      <div className="card">
        <div className="row"><span className="k">Playing as</span><b>{id ? name : "a random Chog"}</b></div>
        {best ? <div className="row"><span className="k">Best run</span><b className="num">{best.toLocaleString()}</b></div> : null}
        <button className="btn block" style={{ minHeight: 52 }} onClick={() => setOpen(true)}>Open the Face Booth</button>
        {!id && <p className="note">Bring your own Chog for scores that count. <button className="linkish" onClick={goHome}>Pick it in Chogmate</button></p>}
      </div>
      <p className="note">Top run of the day makes the Gazette. Best runs climb the Face Booth board in the Palace of Legends.</p>
      {open && createPortal(<FaceBooth tokenId={id} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function DressUp({ shell, goHome }: { shell: Shell; goHome(): void }) {
  const { chog, me } = shell;
  const [look, setLook] = useState(chog?.look ?? { hat: "chef", aura: "gold" });
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (cv.current) drawCard(cv.current, chog, look); }, [chog, look]);

  const choose = async (next: { hat: string; aura: string }) => {
    setLook(next); shell.setLook(next); shell.bounce();
    if (chog && me?.tokenId === chog.id) {
      try { const r = await api<{ saved: boolean }>(`/api/chog/${chog.id}/look`, next); if (r.saved) shell.setChog({ ...chog, look: next }); } catch { /* the preview still works */ }
    }
  };
  const download = () => {
    cv.current?.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `chogtown-${chog?.id ?? "chog"}.png`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      shell.toast("Saved. Attach it to your post on X.");
    }, "image/png");
  };
  const name = chog?.name ?? "my Chog";
  const tweet = `${name} just got a makeover in Chogtown 💜 ${typeof location !== "undefined" ? location.origin : ""}`;

  return (
    <>
      <p className="sub">Dress up {name} and watch it change on the fountain. Just for fun: your real NFT never changes.</p>
      {!chog && <p className="note">Trying it on the town mascot. <button className="linkish" onClick={goHome}>Bring your own Chog</button></p>}
      <canvas ref={cv} className="studio-preview" aria-label={`Preview card of ${name}`} />
      <div className="card"><div className="k">Hat</div><div className="opts">{hats.map(([k, n]) => <button key={k} className="opt" aria-pressed={look.hat === k} onClick={() => choose({ ...look, hat: k })}>{n}</button>)}</div></div>
      <div className="card"><div className="k">Aura</div><div className="opts">{auras.map(([k, n, c]) => <button key={k} className="opt" aria-pressed={look.aura === k} onClick={() => choose({ ...look, aura: k })}><i className="sw" style={{ background: c }} />{n}</button>)}</div></div>
      <div className="row">
        <button className="btn ghost" style={{ flex: 1 }} onClick={download}>Download</button>
        <a className="btn" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }} target="_blank" rel="noopener" href={`https://x.com/intent/tweet?text=${encodeURIComponent(tweet)}`}>Share on X</a>
      </div>
    </>
  );
}
