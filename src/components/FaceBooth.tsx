"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, errMsg } from "./client";
import type { Fighter } from "./RumbleOverlay";

type Feat = { mouth: number; brows: number; smile: number; blink: number; yaw: number; pitch: number };
type RunResult = { score: number; kills: number; bestCombo: number; seconds: number; hearts: number };
type Stage = { eyes(): void; mouth(open: boolean): void; reset(): void; start(): void; snapshot(): string; dispose(): void; state(): { score: number; phase: string } };
type Gest = { startCalibration(ms?: number): void; calibrating(): boolean; threshold(k: "mouth" | "brows"): number; update(f: Feat | null): { mouth: string | null; brows: string | null }; sens: number };
type Saved = { ranked: boolean; pb?: boolean; rank?: number; of?: number; record?: { best: number; runs: number; todayBest: number } };

const loadImg = (src: string) => new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

/** 1080×1350 card: your face at its loudest, your Chog, your score. */
async function drawCard(cv: HTMLCanvasElement, chog: Fighter, r: RunResult, face: string | null, battle: string | null) {
  const W = 1080, H = 1350; cv.width = W; cv.height = H;
  const g = cv.getContext("2d")!;
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#2a1458"); bg.addColorStop(1, "#4a2290"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, 900, 40, W / 2, 900, 600); glow.addColorStop(0, chog.kit.aura.color + "aa"); glow.addColorStop(1, chog.kit.aura.color + "00"); g.fillStyle = glow; g.fillRect(0, 0, W, H);
  // the player's face, mirrored like the camera view
  const fx = 60, fy = 60, fw = 960, fh = 600;
  g.save(); g.beginPath(); g.roundRect(fx, fy, fw, fh, 48); g.clip();
  g.fillStyle = "#1b0f3d"; g.fillRect(fx, fy, fw, fh);
  // no camera: show the battle instead (not mirrored)
  const fi = await loadImg(face || battle || "");
  if (fi) { const k = Math.max(fw / fi.width, fh / fi.height), w = fi.width * k, h = fi.height * k; if (face) { g.translate(fx + fw, fy); g.scale(-1, 1); } else g.translate(fx, fy); g.drawImage(fi, (fw - w) / 2, (fh - h) / 2, w, h); }
  g.restore();
  g.lineWidth = 6; g.strokeStyle = "#ff9bcb"; g.beginPath(); g.roundRect(fx, fy, fw, fh, 48); g.stroke();
  g.fillStyle = "rgba(20,9,31,.7)"; g.beginPath(); g.roundRect(fx + 28, fy + 28, 290, 64, 32); g.fill();
  g.fillStyle = "#fff5e9"; g.font = "700 30px -apple-system, 'Helvetica Neue', sans-serif"; g.textAlign = "left"; g.fillText(face ? "my face, mid-attack" : "the battle", fx + 54, fy + 71);
  // the Chog
  const art = await loadImg(chog.image);
  const cx = 250, cy = 930, cr = 175;
  g.save(); g.shadowColor = chog.kit.aura.color; g.shadowBlur = 60; g.beginPath(); g.arc(cx, cy, cr, 0, Math.PI * 2); g.fillStyle = "#d9c6f5"; g.fill(); g.restore();
  g.save(); g.beginPath(); g.arc(cx, cy, cr, 0, Math.PI * 2); g.clip(); if (art) g.drawImage(art, cx - cr, cy - cr, cr * 2, cr * 2); g.restore();
  g.lineWidth = 8; g.strokeStyle = "#f4ce87"; g.beginPath(); g.arc(cx, cy, cr, 0, Math.PI * 2); g.stroke();
  // score + powers
  g.textAlign = "left"; g.fillStyle = "#fff5e9"; g.font = "800 150px -apple-system, 'Helvetica Neue', sans-serif"; g.fillText(r.score.toLocaleString(), 470, 920);
  g.fillStyle = "rgba(240,232,255,.8)"; g.font = "500 34px -apple-system, 'Helvetica Neue', sans-serif";
  g.fillText(`${r.kills} jeets blasted · best combo ×${r.bestCombo}`, 474, 980);
  g.fillStyle = "#f4ce87"; g.font = "600 30px -apple-system, 'Helvetica Neue', sans-serif";
  g.fillText(`Brows: ${chog.kit.eyes.name}`, 474, 1040); g.fillText(`Mouth: ${chog.kit.mouth.name}`, 474, 1084);
  g.fillStyle = "#fff5e9"; g.font = "700 46px -apple-system, 'Helvetica Neue', sans-serif"; g.textAlign = "center"; g.fillText(chog.label, cx, cy + cr + 70);
  g.fillStyle = "rgba(240,232,255,.6)"; g.font = "600 28px -apple-system, 'Helvetica Neue', sans-serif"; g.fillText("CHOGTOWN · FACE BOOTH", W / 2, H - 50);
}

export default function FaceBooth({ tokenId, onClose }: { tokenId?: number | null; onClose?(): void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const card = useRef<HTMLCanvasElement>(null);
  const stage = useRef<Stage | null>(null);
  const gest = useRef<Gest | null>(null);
  const faceShot = useRef<string | null>(null);
  const battleShot = useRef<string | null>(null);
  const [chog, setChog] = useState<Fighter | null>(null);
  const [num, setNum] = useState("");
  const [cam, setCam] = useState<"off" | "loading" | "calibrating" | "on" | "error">("off");
  const [err, setErr] = useState("");
  const [feat, setFeat] = useState<Feat | null>(null);
  const [sens, setSens] = useState(1);
  const [score, setScore] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [best, setBest] = useState<number | null>(null);

  const load = useCallback(async (id?: number | null) => {
    setErr("");
    try {
      let t = id ?? undefined;
      if (!t) { const me = await api<{ tokenId: number | null }>("/api/me").catch(() => ({ tokenId: null })); t = me.tokenId ?? 1 + Math.floor(Math.random() * 1969); }
      const r = await api<{ foe: Fighter }>("/api/arena/callout", { tokenId: t });
      setChog(r.foe);
    } catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { load(tokenId); }, [load, tokenId]);
  useEffect(() => { api<{ record: { best: number } | null }>("/api/booth").then((r) => setBest(r.record?.best ?? null)).catch(() => {}); }, [saved]);
  // headless check of the face pipeline on a still photo
  useEffect(() => { (window as unknown as { __faceTest?: unknown }).__faceTest = async (u: string) => (await import("@/booth/face")).testImage(u); }, []);

  // grab the player's face the moment a mouth power fires: that's the shareable frame
  const grabFace = useCallback(() => {
    const v = video.current; if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0); faceShot.current = c.toDataURL("image/jpeg", .85);
  }, []);

  const onEnd = useCallback(async (r: RunResult) => {
    battleShot.current = battleShot.current ?? stage.current?.snapshot() ?? null;
    setRunning(false); setResult(r); setSaved(null);
    try { setSaved(await api<Saved>("/api/booth", r)); } catch { setSaved({ ranked: false }); }
  }, []);

  useEffect(() => {
    if (!chog || !canvas.current) return;
    let alive = true;
    import("@/booth/stage").then(({ createStage }) => {
      if (!alive || !canvas.current) return;
      stage.current?.dispose();
      stage.current = createStage({ canvas: canvas.current, chog, onScore: setScore, onEnd, onFire: (k: string) => { if (k === "mouth" || !faceShot.current) grabFace(); if (k === "mouth" || !battleShot.current) battleShot.current = stage.current?.snapshot() ?? null; } }) as Stage;
      (window as unknown as { __booth?: unknown }).__booth = stage.current;
    });
    return () => { alive = false; stage.current?.dispose(); stage.current = null; };
  }, [chog, onEnd, grabFace]);

  useEffect(() => { if (result && chog && card.current) drawCard(card.current, chog, result, faceShot.current, battleShot.current); }, [result, chog]);

  // keyboard fallback: E = eyes, M (hold) = mouth
  useEffect(() => {
    const d = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      const k = e.key.toLowerCase();
      if (k === "e" && !e.repeat) stage.current?.eyes();
      if (k === "m" && !e.repeat) stage.current?.mouth(true);
      if (k === "escape") onClose?.();
    };
    const u = (e: KeyboardEvent) => { if (e.key.toLowerCase() === "m") stage.current?.mouth(false); };
    addEventListener("keydown", d); addEventListener("keyup", u);
    return () => { removeEventListener("keydown", d); removeEventListener("keyup", u); };
  }, [onClose]);

  useEffect(() => { if (gest.current) gest.current.sens = sens; }, [sens]);

  // release the camera when the booth closes
  useEffect(() => () => { const v = video.current; (v?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop()); }, []);

  const camOn = async () => {
    setErr(""); setCam("loading");
    try {
      const face = await import("@/booth/face");
      await Promise.all([face.loadTracker(), face.startCamera(video.current!)]);
      const g = face.makeGestures() as Gest; g.sens = sens; gest.current = g;
      g.startCalibration(); setCam("calibrating");
      let lastUi = 0;
      face.track(video.current!, (f: Feat | null) => {
        const ev = g.update(f);
        if (!g.calibrating()) setCam((c) => (c === "calibrating" ? "on" : c));
        if (ev.mouth === "down") stage.current?.mouth(true);
        if (ev.mouth === "up") stage.current?.mouth(false);
        if (ev.brows === "down") stage.current?.eyes();
        const now = performance.now(); if (now - lastUi > 66) { lastUi = now; setFeat(f); }
      });
    } catch (e) {
      setCam("error");
      const m = errMsg(e);
      setErr(/Permission|NotAllowed/i.test(m) ? "Camera blocked. Allow it in the address bar, or play with the keyboard: E = eyes, M = mouth." : `Couldn't start the camera: ${m}`);
    }
  };
  const go = () => { faceShot.current = null; battleShot.current = null; setResult(null); setSaved(null); setRunning(true); stage.current?.start(); };

  const download = () => card.current?.toBlob((b) => {
    if (!b) return;
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `chogtown-face-booth-${chog?.id ?? "chog"}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, "image/png");
  const tweet = result && chog ? `My face just blasted ${result.kills} jeets with ${chog.name}'s ${chog.kit.eyes.name.toLowerCase()} in the Chogtown Face Booth. ${result.score.toLocaleString()} points 💜 ${typeof location !== "undefined" ? location.origin + "/booth" : ""}` : "";

  const g = gest.current;
  const meter = (label: string, v: number | undefined, k?: "mouth" | "brows") => {
    const th = k && g ? g.threshold(k) : null, hot = th != null && (v ?? 0) > th;
    return (
      <div className={`fb-meter${hot ? " hot" : ""}`} key={label}>
        <div className="row"><span>{label}</span><span className="num">{v != null ? Math.round(v * 100) : "–"}</span></div>
        <div className="fb-bar"><i style={{ width: `${Math.min(100, (v ?? 0) * 100)}%` }} />{th != null && <b style={{ left: `${th * 100}%` }} />}</div>
      </div>
    );
  };

  return (
    <main className={`fb${onClose ? " fb-over" : ""}`}>
      <section className="fb-stage">
        <canvas ref={canvas} className="fb-canvas" />
        <div className="fb-top">
          {onClose ? <button className="pill glass btnlike" onClick={onClose}>← Back to the Boutique</button> : <a className="pill glass btnlike" href="/">← Chogtown</a>}
          <span className="pill glass">Face Booth</span>
        </div>
        <div className="fb-keys">{chog && <><span><b>Raise brows</b> {chog.kit.eyes.name}</span><span><b>Open mouth</b> {chog.kit.mouth.name}</span></>}</div>
        {result && chog && (
          <div className="fb-done glass">
            <canvas ref={card} className="fb-card" aria-label="Your Face Booth card" />
            <div className="fb-done-side">
              <div className="eyebrow">{result.hearts > 0 ? "Time!" : "Jeeted"}</div>
              <h2>{result.score.toLocaleString()} points</h2>
              <p className="note">{result.kills} jeets blasted · best combo ×{result.bestCombo}</p>
              <p className="note">{!saved ? "Saving…" : saved.ranked ? `${saved.pb ? "New personal best! " : ""}#${saved.rank} of ${saved.of} in town today. Best ever: ${saved.record?.best}.` : "Guest run: just for fun. Sign in with your Chog to post scores."}</p>
              <button className="btn block" onClick={download}>Download card</button>
              <a className="btn ghost block" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }} target="_blank" rel="noopener" href={`https://x.com/intent/tweet?text=${encodeURIComponent(tweet)}`}>Share on X</a>
              <button className="btn violet block" onClick={go}>Run again</button>
            </div>
          </div>
        )}
      </section>
      <aside className="fb-side glass">
        <div className="eyebrow">The Boutique Quarter</div>
        <h2 style={{ margin: 0 }}>Face Booth</h2>
        <p className="sub" style={{ margin: 0 }}>Your face fires your Chog. Raise your eyebrows for its eyes, open your mouth wide for its mouth. Jeets drift in for 60 seconds. Your camera stays in this browser.</p>
        {chog && (
          <div className="card">
            <div className="row"><img className="rumble-face" src={chog.image} alt="" /><div style={{ flex: 1 }}><b>{chog.label}</b><div className="k">{chog.archetypeName}{best ? ` · best ${best}` : ""}</div></div></div>
            <ul className="kit">{chog.lines.slice(0, 2).map((l) => <li key={l.slot}><span className="k">{l.slot}</span><span>{l.what}</span></li>)}</ul>
            {!tokenId && (
              <form className="field" onSubmit={(e) => { e.preventDefault(); if (num) load(Number(num)); }}>
                <input inputMode="numeric" placeholder="Try another Chog, 1–1969" value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, "").slice(0, 4))} aria-label="Chog number" />
                <button className="btn violet" disabled={!num}>Go</button>
              </form>
            )}
          </div>
        )}
        <div className="card">
          <div className="row">
            <video ref={video} className="fb-video" playsInline muted />
            <div style={{ flex: 1, display: "grid", gap: 8 }}>
              {cam === "off" || cam === "error" ? <button className="btn block" onClick={camOn}>Turn on camera</button> :
                cam === "loading" ? <button className="btn block" disabled>Loading face tracker…</button> :
                cam === "calibrating" ? <button className="btn block" disabled>Hold a neutral face…</button> :
                <button className="btn ghost block" onClick={() => { gest.current?.startCalibration(); setCam("calibrating"); }}>Recalibrate</button>}
              <span className="k">{cam === "on" ? "Tracking your face" : cam === "calibrating" ? "Calibrating to your face (2s)" : "No camera? Keyboard: E = eyes, M = mouth"}</span>
            </div>
          </div>
          {err && <p className="err">{err}</p>}
          {meter("Brows up → Eyes", feat?.brows, "brows")}
          {meter("Mouth open → Mouth", feat?.mouth, "mouth")}
          <label className="fb-sens"><span className="k">Sensitivity</span><input type="range" min={0.6} max={1.8} step={0.05} value={sens} onChange={(e) => setSens(Number(e.target.value))} /><span className="num k">{sens.toFixed(2)}×</span></label>
        </div>
        <button className="btn block" style={{ minHeight: 52, fontSize: 16 }} onClick={go} disabled={running || !chog}>{running ? `Running… ${score}` : "Start a 60-second run"}</button>
      </aside>
    </main>
  );
}
