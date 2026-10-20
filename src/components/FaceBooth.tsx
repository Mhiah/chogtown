"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, errMsg } from "./client";
import type { Fighter } from "./RumbleOverlay";

type Feat = { mouth: number; brows: number; smile: number; blink: number; yaw: number; pitch: number };
type Stage = { eyes(): void; mouth(open: boolean): void; reset(): void; dispose(): void; state(): { score: number; hearts: number; over: boolean } };
type Gest = { startCalibration(ms?: number): void; calibrating(): boolean; threshold(k: "mouth" | "brows"): number; update(f: Feat | null): { mouth: string | null; brows: string | null }; sens: number; base: { mouth: number; brows: number } };

/**
 * Face Booth (test build). Your camera never leaves the browser: MediaPipe reads your face locally.
 * Open your mouth wide: the Chog's Mouth power. Raise your eyebrows: the Chog's Eyes power.
 */
export default function FaceBooth() {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<Stage | null>(null);
  const gest = useRef<Gest | null>(null);
  const [chog, setChog] = useState<Fighter | null>(null);
  const [num, setNum] = useState("");
  const [cam, setCam] = useState<"off" | "loading" | "calibrating" | "on" | "error">("off");
  const [err, setErr] = useState("");
  const [feat, setFeat] = useState<Feat | null>(null);
  const [sens, setSens] = useState(1);
  const [fires, setFires] = useState({ mouth: 0, brows: 0 });
  const [fps, setFps] = useState(0);
  const [score, setScore] = useState(0);

  const load = useCallback(async (id?: number) => {
    setErr("");
    try {
      let tokenId = id;
      if (!tokenId) { const me = await api<{ tokenId: number | null }>("/api/me").catch(() => ({ tokenId: null })); tokenId = me.tokenId ?? 1 + Math.floor(Math.random() * 1969); }
      const r = await api<{ foe: Fighter }>("/api/arena/callout", { tokenId });
      setChog(r.foe);
    } catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // headless check of the face pipeline on a still photo
  useEffect(() => { (window as unknown as { __faceTest?: unknown }).__faceTest = async (u: string) => (await import("@/booth/face")).testImage(u); }, []);

  // the stage follows whichever Chog is picked
  useEffect(() => {
    if (!chog || !canvas.current) return;
    let alive = true;
    import("@/booth/stage").then(({ createStage }) => {
      if (!alive || !canvas.current) return;
      stage.current?.dispose();
      stage.current = createStage({ canvas: canvas.current, chog, onScore: setScore }) as Stage;
      (window as unknown as { __booth?: unknown }).__booth = stage.current;
    });
    return () => { alive = false; stage.current?.dispose(); stage.current = null; };
  }, [chog]);

  // keyboard fallback: E = eyes, M (hold) = mouth, R = again
  useEffect(() => {
    const d = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      const k = e.key.toLowerCase();
      if (k === "e" && !e.repeat) stage.current?.eyes();
      if (k === "m" && !e.repeat) stage.current?.mouth(true);
      if (k === "r") stage.current?.reset();
    };
    const u = (e: KeyboardEvent) => { if (e.key.toLowerCase() === "m") stage.current?.mouth(false); };
    addEventListener("keydown", d); addEventListener("keyup", u);
    return () => { removeEventListener("keydown", d); removeEventListener("keyup", u); };
  }, []);

  useEffect(() => { if (gest.current) gest.current.sens = sens; }, [sens]);

  const start = async () => {
    setErr(""); setCam("loading");
    try {
      const face = await import("@/booth/face");
      await Promise.all([face.loadTracker(), face.startCamera(video.current!)]);
      const g = face.makeGestures() as Gest; g.sens = sens; gest.current = g;
      g.startCalibration(); setCam("calibrating");
      let frames = 0, t0 = performance.now(), lastUi = 0;
      face.track(video.current!, (f: Feat | null) => {
        frames++;
        const now = performance.now();
        if (now - t0 > 1000) { setFps(frames); frames = 0; t0 = now; }
        const ev = g.update(f);
        if (!g.calibrating()) setCam((c) => (c === "calibrating" ? "on" : c));
        if (ev.mouth === "down") { stage.current?.mouth(true); setFires((x) => ({ ...x, mouth: x.mouth + 1 })); }
        if (ev.mouth === "up") stage.current?.mouth(false);
        if (ev.brows === "down") { stage.current?.eyes(); setFires((x) => ({ ...x, brows: x.brows + 1 })); }
        if (now - lastUi > 66) { lastUi = now; setFeat(f); }
      });
    } catch (e) {
      setCam("error");
      const m = errMsg(e);
      setErr(/Permission|NotAllowed/i.test(m) ? "Camera permission was blocked. Allow it in the address bar, or play with the keyboard: E = eyes, M = mouth." : `Couldn't start the camera: ${m}`);
    }
  };
  const recal = () => { gest.current?.startCalibration(); setCam("calibrating"); };

  const g = gest.current;
  const meter = (label: string, v: number | undefined, k?: "mouth" | "brows", fired?: number) => {
    const th = k && g ? g.threshold(k) : null;
    const hot = th != null && (v ?? 0) > th;
    return (
      <div className={`fb-meter${hot ? " hot" : ""}`} key={label}>
        <div className="row"><span>{label}</span><span className="num">{v != null ? Math.round(v * 100) : "–"}{fired != null ? ` · fired ${fired}` : ""}</span></div>
        <div className="fb-bar"><i style={{ width: `${Math.min(100, (v ?? 0) * 100)}%` }} />{th != null && <b style={{ left: `${th * 100}%` }} />}</div>
      </div>
    );
  };

  return (
    <main className="fb">
      <section className="fb-stage">
        <canvas ref={canvas} className="fb-canvas" />
        <div className="fb-top">
          <a className="pill glass btnlike" href="/">← Chogtown</a>
          <span className="pill glass">Face Booth · test</span>
        </div>
        <div className="fb-keys">{chog && <><span><b>Raise brows</b> {chog.kit.eyes.name}</span><span><b>Open mouth</b> {chog.kit.mouth.name}</span></>}</div>
      </section>
      <aside className="fb-side glass">
        <div className="eyebrow">Face Booth</div>
        <h2 style={{ margin: 0 }}>Your face fires your Chog</h2>
        <p className="sub" style={{ margin: 0 }}>Raise your eyebrows to fire its eyes. Open your mouth wide for its mouth power. Your camera stays in this browser; nothing is uploaded.</p>
        {chog && (
          <div className="card">
            <div className="row"><img className="rumble-face" src={chog.image} alt="" /><div style={{ flex: 1 }}><b>{chog.label}</b><div className="k">{chog.archetypeName}</div></div></div>
            <ul className="kit">{chog.lines.slice(0, 2).map((l) => <li key={l.slot}><span className="k">{l.slot}</span><span>{l.what}</span></li>)}</ul>
            <form className="field" onSubmit={(e) => { e.preventDefault(); if (num) load(Number(num)); }}>
              <input inputMode="numeric" placeholder="Try another Chog, 1–1969" value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, "").slice(0, 4))} aria-label="Chog number" />
              <button className="btn violet" disabled={!num}>Go</button>
              <button type="button" className="btn ghost" onClick={() => load(1 + Math.floor(Math.random() * 1969))}>Random</button>
            </form>
          </div>
        )}
        <div className="card">
          <div className="row">
            <video ref={video} className="fb-video" playsInline muted />
            <div style={{ flex: 1, display: "grid", gap: 8 }}>
              {cam === "off" || cam === "error" ? <button className="btn block" onClick={start}>Turn on camera</button> :
                cam === "loading" ? <button className="btn block" disabled>Loading face tracker…</button> :
                cam === "calibrating" ? <button className="btn block" disabled>Hold a neutral face…</button> :
                <button className="btn ghost block" onClick={recal}>Recalibrate</button>}
              <span className="k">{cam === "on" ? `${fps} fps tracking` : cam === "calibrating" ? "Calibrating to your face (2s)" : "Or use the keyboard: E = eyes, M = mouth"}</span>
            </div>
          </div>
          {err && <p className="err">{err}</p>}
          {meter("Brows up → Eyes", feat?.brows, "brows", fires.brows)}
          {meter("Mouth open → Mouth", feat?.mouth, "mouth", fires.mouth)}
          {meter("Smile", feat?.smile)}
          {meter("Blink (ignored)", feat?.blink)}
          <label className="fb-sens"><span className="k">Sensitivity</span><input type="range" min={0.6} max={1.8} step={0.05} value={sens} onChange={(e) => setSens(Number(e.target.value))} /><span className="num k">{sens.toFixed(2)}×</span></label>
        </div>
        <div className="row"><span className="k">Score</span><b className="num">{score}</b><button className="btn ghost" onClick={() => stage.current?.reset()}>Again</button></div>
      </aside>
    </main>
  );
}
