"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, errMsg } from "./client";
import type { Kit } from "@/lib/kit";

export interface Fighter {
  id: number; name: string; label: string; nftName: string; archetype: string; archetypeName: string;
  image: string; kit: Kit; lines: { slot: string; what: string }[]; taunt: string;
  record: { w: number; l: number; streak: number; best: number; fights: number; ko: number };
}
type Result = { won: boolean; myStocks: number; foeStocks: number; seconds: number; dealt: number; taken: number; ringouts: number };
type Saved = { ranked: boolean; limit?: boolean; winLine: string; loseLine: string; left?: number };

export default function RumbleOverlay({ me, foe, why, ranked, onClose, toast }: { me: Fighter; foe: Fighter; why: string; ranked: boolean; onClose(changed: boolean): void; toast(t: string): void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<{ dispose(): void; stick(v: { x: number; y: number } | null): void; press(k: string): void; cooldowns(): { atk: number; spc: number; dash: number } } | null>(null);
  const [stage, setStage] = useState<"vs" | "fight" | "done">("vs");
  const [result, setResult] = useState<Result | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [round, setRound] = useState(0);
  const [cds, setCds] = useState({ atk: 0, spc: 0, dash: 0 });
  const changed = useRef(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const running = stage !== "vs";
  const live = useRef({ me, foe, toast }); live.current = { me, foe, toast };
  useEffect(() => {
    if (!running || !canvas.current) return;
    const { me, foe, toast } = live.current;
    let alive = true;
    import("@/arena/rumble").then(({ createRumble }) => {
      (window as unknown as { __createRumble?: unknown }).__createRumble = createRumble; // headless checks and demo capture
      if (!alive || !canvas.current) return;
      game.current = createRumble({
        canvas: canvas.current,
        me: { ...me, image: me.image }, foe: { ...foe, image: foe.image },
        hard: foe.record.w > 4,
        onEnd: async (r: Result) => {
          setResult(r); setStage("done");
          try { const s = await api<Saved>("/api/arena/result", { foe: foe.id, ...r }); setSaved(s); if (s.ranked) changed.current = true; }
          catch (e) { toast(errMsg(e)); }
        },
      });
      (window as unknown as { __rumble?: unknown }).__rumble = game.current;
    });
    const t = setInterval(() => { if (game.current) setCds(game.current.cooldowns()); }, 120);
    return () => { alive = false; clearInterval(t); game.current?.dispose(); game.current = null; };
  }, [running, round]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(changed.current); };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [onClose]);

  // left-thumb joystick for phones
  const stickRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [knob, setKnob] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const down = (e: React.PointerEvent) => { if (e.pointerType !== "touch") return; stickRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; setKnob({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 }); };
  const move = (e: React.PointerEvent) => {
    const s = stickRef.current; if (!s || s.id !== e.pointerId) return;
    let dx = e.clientX - s.x, dy = e.clientY - s.y; const l = Math.hypot(dx, dy), m = 54;
    if (l > m) { dx = dx / l * m; dy = dy / l * m; }
    setKnob({ x: s.x, y: s.y, dx, dy }); game.current?.stick({ x: dx / m, y: dy / m });
  };
  const up = (e: React.PointerEvent) => { if (stickRef.current?.id !== e.pointerId) return; stickRef.current = null; setKnob(null); game.current?.stick(null); };

  if (!mounted) return null;
  return createPortal(
    <div className="rumble">
      {stage === "vs" && (
        <div className="rumble-vs">
          <div className="vs-side left">
            <img src={me.image} alt="" />
            <div className="vs-name">{me.label}</div>
            <div className="vs-type">{me.archetypeName}</div>
            <ul className="kit">{me.lines.slice(0, 4).map((l) => <li key={l.slot}><span className="k">{l.slot}</span><span>{l.what}</span></li>)}</ul>
          </div>
          <div className="vs-mid">VS</div>
          <div className="vs-side right">
            <img src={foe.image} alt="" />
            <div className="vs-name">{foe.label}</div>
            <div className="vs-type">{foe.archetypeName} · {foe.record.w}–{foe.record.l}</div>
            <ul className="kit">{foe.lines.slice(0, 4).map((l) => <li key={l.slot}><span className="k">{l.slot}</span><span>{l.what}</span></li>)}</ul>
          </div>
          <div className="vs-foot">
            <p className="quote">“{foe.taunt}” <span className="k">— {foe.name}</span></p>
            <p className="note">{why} {ranked ? "Ranked fight." : "Exhibition: nothing is recorded."}</p>
            <div className="vs-btns">
              <button className="btn" onClick={() => setStage("fight")}>Fight</button>
              <button className="btn ghost" onClick={() => onClose(false)}>Not now</button>
            </div>
          </div>
        </div>
      )}
      {stage !== "vs" && (
        <div className="rumble-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <canvas ref={canvas} className="rumble-canvas" />
          <button className="rumble-x" aria-label="Leave the fight" onClick={() => onClose(changed.current)}>✕</button>
          <div className="rumble-keys hide-m">
            <span><b>J</b> {me.kit.eyes.name}</span><span><b>K</b> {me.kit.mouth.name}</span><span><b>Space</b> {me.kit.dash.name}</span>
          </div>
          <div className="rumble-pad show-m" onPointerDown={(e) => e.stopPropagation()}>
            <button className="pad atk" onPointerDown={() => game.current?.press("atk")} style={{ opacity: cds.atk > 0 ? .55 : 1 }}>Eyes</button>
            <button className="pad spc" onPointerDown={() => game.current?.press("spc")} style={{ opacity: cds.spc > 0 ? .45 : 1 }}>{cds.spc > 0 ? Math.ceil(cds.spc) : "Mouth"}</button>
            <button className="pad dash" onPointerDown={() => game.current?.press("dash")} style={{ opacity: cds.dash > 0 ? .5 : 1 }}>Dash</button>
          </div>
          {knob && <div className="stick" style={{ left: knob.x, top: knob.y }}><i style={{ transform: `translate(${knob.dx}px, ${knob.dy}px)` }} /></div>}
          {stage === "done" && result && (
            <div className="rumble-done">
              <div className="eyebrow">{result.won ? "Winner" : "Knocked out"}</div>
              <h2>{result.won ? `${me.name} wins` : `${foe.name} wins`}</h2>
              <p className="quote">“{saved ? (result.won ? saved.winLine : saved.loseLine) : "…"}” <span className="k">— {me.name}</span></p>
              <div className="done-stats">
                <div><b>{result.myStocks}</b><span>lives left</span></div>
                <div><b>{result.dealt}%</b><span>damage dealt</span></div>
                <div><b>{result.ringouts}</b><span>ring-outs</span></div>
                <div><b>{result.seconds}s</b><span>fight time</span></div>
              </div>
              <p className="note">{!saved ? "Telling the town…" : saved.ranked ? `Recorded. ${result.won ? "The Gazette will hear about this." : "Confidence took a knock."} ${saved.left ?? 0} ranked fight${saved.left === 1 ? "" : "s"} left today.` : saved.limit ? "That's all the ranked fights for today. This one was an exhibition." : "Exhibition fight. Sign in with your own Chog to make it count."}</p>
              <div className="vs-btns">
                <button className="btn" onClick={() => { setResult(null); setSaved(null); setStage("fight"); setRound((r) => r + 1); }}>Rematch</button>
                <button className="btn ghost" onClick={() => onClose(changed.current)}>Back to town</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
