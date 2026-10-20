/* eslint-disable */
// @ts-nocheck
/*
 * Face input for the Face Booth: MediaPipe Face Landmarker in the browser (no server, nothing uploaded).
 * Turns blendshapes into two deliberate gestures:
 *   MOUTH: open your mouth wide  -> the Chog's mouth power
 *   BROWS: raise your eyebrows   -> the Chog's eyes power
 * A short neutral-face calibration sets each person's baseline, so normal talking and blinking don't fire.
 */
const VER = '0.10.14';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let landmarker = null;
export async function loadTracker(mode = 'VIDEO'){
  const vision = await import(/* webpackIgnore: true */ `${CDN}/vision_bundle.mjs`);
  const files = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
  const make = delegate => vision.FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: MODEL, delegate },
    outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true, runningMode: mode, numFaces: 1,
  });
  try { landmarker = await make('GPU'); } catch { landmarker = await make('CPU'); }
  return landmarker;
}

/** Reads one frame (or image) into the numbers the booth uses, all 0..1 except head angles (radians). */
export function read(res){
  const cats = res?.faceBlendshapes?.[0]?.categories;
  if (!cats) return null;
  const b = Object.fromEntries(cats.map(c => [c.categoryName, c.score]));
  const m = res.facialTransformationMatrixes?.[0]?.data;
  const yaw = m ? Math.atan2(m[8], m[10]) : 0, pitch = m ? Math.asin(Math.max(-1, Math.min(1, -m[9]))) : 0;
  return {
    mouth: b.jawOpen ?? 0,
    brows: ((b.browInnerUp ?? 0) * 2 + (b.browOuterUpLeft ?? 0) + (b.browOuterUpRight ?? 0)) / 4,
    smile: ((b.mouthSmileLeft ?? 0) + (b.mouthSmileRight ?? 0)) / 2,
    blink: ((b.eyeBlinkLeft ?? 0) + (b.eyeBlinkRight ?? 0)) / 2,
    yaw, pitch,
  };
}

/** Rising-edge gesture detector with a per-person baseline and hysteresis. */
export function makeGestures(){
  const g = {
    base: { mouth: .05, brows: .15 }, calib: null, sens: 1,
    on: { mouth: false, brows: false }, last: { mouth: 0, brows: 0 },
    startCalibration(ms = 2200){ g.calib = { until: performance.now() + ms, n: 0, sum: { mouth: 0, brows: 0 }, max: { mouth: 0, brows: 0 } }; },
    calibrating(){ return !!g.calib; },
    threshold(k){ const gap = k === 'mouth' ? .32 : .22; return Math.min(.92, g.base[k] + gap / g.sens); },
    /** returns { mouth: 'down'|'up'|null, brows: ... } edges for this frame */
    update(f, now = performance.now()){
      const out = { mouth: null, brows: null };
      if (!f) return out;
      if (g.calib){
        const c = g.calib; c.n++;
        for (const k of ['mouth', 'brows']){ c.sum[k] += f[k]; c.max[k] = Math.max(c.max[k], f[k]); }
        if (now > c.until && c.n > 10){ for (const k of ['mouth', 'brows']) g.base[k] = Math.max(c.sum[k] / c.n, c.max[k] * .8); g.calib = null; }
        return out;
      }
      for (const k of ['mouth', 'brows']){
        const hi = g.threshold(k), lo = g.base[k] + (hi - g.base[k]) * .5;
        if (!g.on[k] && f[k] > hi && now - g.last[k] > (k === 'mouth' ? 450 : 280)){ g.on[k] = true; g.last[k] = now; out[k] = 'down'; }
        else if (g.on[k] && f[k] < lo){ g.on[k] = false; out[k] = 'up'; }
      }
      return out;
    },
  };
  return g;
}

export async function startCamera(video){
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
  video.srcObject = stream; video.muted = true; video.playsInline = true;
  await video.play();
  return stream;
}

/** Calls onFrame(features) for every new camera frame. Returns a stop function. */
export function track(video, onFrame){
  let raf = 0, lastT = -1, stopped = false;
  const loop = () => {
    if (stopped) return;
    if (landmarker && video.readyState >= 2 && video.currentTime !== lastT){
      lastT = video.currentTime;
      let res = null; try { res = landmarker.detectForVideo(video, performance.now()); } catch {}
      onFrame(read(res));
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => { stopped = true; cancelAnimationFrame(raf); };
}

/** Headless check: run the tracker on a still image and return the booth's numbers. */
export async function testImage(url){
  const lm = await loadTracker('IMAGE');
  const bmp = await createImageBitmap(await (await fetch(url)).blob());
  const out = read(lm.detect(bmp));
  landmarker = null;
  return out;
}
