/* eslint-disable */
// @ts-nocheck
/* Chogtown 3D town. Ported from the standalone prototype; the React shell drives it through the returned handle. */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const hats = [['none','None'],['party','Party'],['crown','Crown'],['chef','Chef']];
export const auras = [['gold','Gold','#f4ce87'],['rose','Rose','#ff9bcb'],['cyan','Crystal','#79e8ec'],['mint','Mint','#a4e8c4']];

export function createTown({ canvas, labelsEl, onOpen }){
const hooks = { onOpen };
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = innerWidth < 760 || matchMedia('(pointer: coarse)').matches;
const Q = mobile ? .55 : 1;
THREE.ColorManagement.legacyMode = false;

/* seeded random so the town is the same every visit */
let seed = 20261014;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const rr = (a, b) => a + rnd() * (b - a);
const pickOne = a => a[Math.floor(rnd() * a.length)];
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ---------- studio options ---------- */
let look = { hat:'chef', aura:'gold' };
/* ---------- town layout (camera looks from the south, +z) ---------- */
const R = 14;
const places = [
  { key:'home', name:'Your Chogmate', blurb:'Check in, chat and see who it is becoming', eyebrow:'The heart of Chogtown', x:0, z:0, foot:5.7, label:3.9, icon:'home', cam:{r:8.5, phi:1.08} },
  { key:'arena', name:'The Royal Amphitheatre', blurb:'Rumble your rivals, then tonight’s debate', eyebrow:'Games', x:0, z:-9.6, foot:4.4, label:5.2, icon:'arena', cam:{r:15, phi:.88} },
  { key:'feed', name:'The Grand Gazette', blurb:'Last night’s gossip', eyebrow:'Town feed', x:8.6, z:-5.2, foot:3.1, label:10.6, icon:'feed', cam:{r:16, phi:1.0} },
  { key:'hall', name:'Palace of Legends', blurb:'Streaks, wins and feuds', eyebrow:'Leaderboards', x:-9.2, z:-1.6, foot:4.3, label:5.9, icon:'hall', cam:{r:15, phi:.95} },
  { key:'shop', name:'The Boutique Quarter', blurb:'Face Booth: your face fires your Chog', eyebrow:'Face Booth & studio', x:7.4, z:5.8, foot:3.5, label:4.9, icon:'shop', cam:{r:13.5, phi:.95} }
];
const P = Object.fromEntries(places.map(p => [p.key, p]));
const extra = [ { key:'cafe', x:-6.6, z:6.6, foot:3.0 }, { key:'view', x:0, z:12.4, foot:1.8 } ];

/* ---------- renderer ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias:!mobile, powerPreference:'high-performance' });
let pr = Math.min(devicePixelRatio, mobile ? 1.5 : 1.75);
renderer.setPixelRatio(pr);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, .1, 600);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
const ENV = .32;
scene.fog = new THREE.Fog(new THREE.Color('#d9cbff'), 110, 300);

/* ---------- canvas textures ---------- */
function ctex(w, h, draw, repeat){
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (repeat){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const marbleTex = (base, vein) => ctex(512, 512, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++){ g.fillStyle = `rgba(255,255,255,${rr(0,.05)})`; g.beginPath(); g.arc(rr(0,w), rr(0,h), rr(10,60), 0, 7); g.fill(); }
  g.lineCap = 'round';
  for (let i = 0; i < 16; i++){
    g.strokeStyle = i % 3 ? `rgba(255,255,255,${rr(.15,.35)})` : vein; g.lineWidth = rr(.6, 2.2);
    g.beginPath(); let x = rr(-50, w), y = rr(-50, h); g.moveTo(x, y);
    for (let k = 0; k < 6; k++){ const nx = x + rr(30, 120), ny = y + rr(-70, 90); g.quadraticCurveTo(x + rr(-30, 60), y + rr(-50, 50), nx, ny); x = nx; y = ny; }
    g.stroke();
  }
}, [1, 1]);
const tileTex = (a, b, edge) => ctex(256, 256, (g, w, h) => {
  g.fillStyle = edge; g.fillRect(0, 0, w, h);
  const rows = 8, cols = 8;
  for (let r = 0; r < rows; r++) for (let c = -1; c < cols; c++){
    const x = (c + (r % 2) * .5) * w / cols, y = r * h / rows;
    g.fillStyle = rnd() < .5 ? a : b; g.beginPath(); g.ellipse(x + w / cols / 2, y + h / rows * .62, w / cols * .48, h / rows * .62, 0, 0, Math.PI); g.fill();
  }
}, [3, 2]);
const stripeTex = (a, b, n = 8) => ctex(256, 64, (g, w, h) => { for (let i = 0; i < n; i++){ g.fillStyle = i % 2 ? a : b; g.fillRect(i * w / n, 0, w / n + 1, h); } }, [1, 1]);
const glowTex = ctex(128, 128, (g, w) => { const gr = g.createRadialGradient(w/2, w/2, 0, w/2, w/2, w/2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
const cloudTex = ctex(256, 256, (g, w) => {
  for (let i = 0; i < 26; i++){ const x = rr(.25,.75)*w, y = rr(.4,.65)*w, r = rr(.12,.26)*w; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
});

/* ---------- materials ---------- */
const MAT = {
  marble: new THREE.MeshStandardMaterial({ map: marbleTex('#e7dafc', 'rgba(137,85,216,.35)'), roughness:.28, metalness:0, envMapIntensity:0.32 }),
  marbleV: new THREE.MeshStandardMaterial({ map: marbleTex('#a984ec', 'rgba(255,240,255,.5)'), roughness:.3, envMapIntensity:0.32 }),
  amethyst: new THREE.MeshStandardMaterial({ map: marbleTex('#5a2ea0', 'rgba(188,162,244,.55)'), roughness:.22, metalness:.05, envMapIntensity:0.39 }),
  cream: new THREE.MeshStandardMaterial({ color:'#fff5e9', roughness:.55, envMapIntensity:0.21 }),
  stone: new THREE.MeshStandardMaterial({ color:'#cdb6f2', roughness:.75, envMapIntensity:0.17 }),
  gold: new THREE.MeshStandardMaterial({ color:'#f4ce87', metalness:1, roughness:.24, envMapIntensity:1.1 }),
  goldDark: new THREE.MeshStandardMaterial({ color:'#c99a52', metalness:1, roughness:.35, envMapIntensity:.9 }),
  roofV: new THREE.MeshStandardMaterial({ map: tileTex('#7a48d0', '#6b3cc0', '#3f1f78'), roughness:.5, envMapIntensity:0.24 }),
  roofR: new THREE.MeshStandardMaterial({ map: tileTex('#ffa8d2', '#f892c4', '#b75a92'), roughness:.45, envMapIntensity:0.24 }),
  roofC: new THREE.MeshStandardMaterial({ map: tileTex('#8fe6ea', '#79dfe4', '#3f9ea6'), roughness:.45, envMapIntensity:0.24 }),
  rose: new THREE.MeshStandardMaterial({ color:'#ff9bcb', roughness:.5, envMapIntensity:0.24 }),
  roseMetal: new THREE.MeshStandardMaterial({ color:'#ffb3d6', metalness:.55, roughness:.25, envMapIntensity:0.45 }),
  mint: new THREE.MeshStandardMaterial({ color:'#a4e8c4', roughness:.55 }),
  lilac: new THREE.MeshStandardMaterial({ color:'#d6c2fb', roughness:.55 }),
  peach: new THREE.MeshStandardMaterial({ color:'#ffad91', roughness:.55 }),
  trunk: new THREE.MeshStandardMaterial({ color:'#6a4a8c', roughness:.85 }),
  dark: new THREE.MeshStandardMaterial({ color:'#2a1450', roughness:.4 }),
  white: new THREE.MeshStandardMaterial({ color:'#ffffff', roughness:.25 }),
  lampGlass: new THREE.MeshStandardMaterial({ color:'#ffe2b0', emissive:'#ffc77a', emissiveIntensity:3.2, roughness:.3 }),
  crystal: new THREE.MeshStandardMaterial({ color:'#ffffff', emissive:'#ffffff', emissiveIntensity:1.1, roughness:.15, metalness:.1, vertexColors:false }),
  hedge: new THREE.MeshStandardMaterial({ color:'#5b3a9e', roughness:.9 })
};
const windowMat = () => new THREE.MeshStandardMaterial({ color:'#ffd9a0', emissive:'#ffbf6e', emissiveIntensity:1.7, roughness:.3 });

/* ---------- small helpers ---------- */
const V2 = (x, y) => new THREE.Vector2(x, y);
function mesh(geo, mat, x = 0, y = 0, z = 0, parent){ const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; if (parent) parent.add(m); return m; }
function lathe(pts, seg = 32, start = 0, len = Math.PI * 2){ return new THREE.LatheGeometry(pts.map(p => V2(p[0], p[1])), seg, start, len); }
const _o = new THREE.Object3D();
function inst(geo, mat, list, shadow = true){
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); m.count = list.length;
  list.forEach((d, i) => { _o.position.set(d.p[0], d.p[1], d.p[2]); _o.rotation.set(...(d.r || [0, 0, 0])); const s = d.s ?? 1; typeof s === 'number' ? _o.scale.setScalar(s) : _o.scale.set(s[0], s[1], s[2]); _o.updateMatrix(); m.setMatrixAt(i, _o.matrix); if (d.c) m.setColorAt(i, new THREE.Color(d.c)); });
  m.castShadow = shadow; m.receiveShadow = true; return m;
}
function arch(w, h){ const s = new THREE.Shape(); s.moveTo(-w/2, 0); s.lineTo(-w/2, h - w/2); s.absarc(0, h - w/2, w/2, Math.PI, 0, true); s.lineTo(w/2, 0); s.lineTo(-w/2, 0); return new THREE.ShapeGeometry(s, 10); }
const G = {
  column: lathe([[0,0],[.27,0],[.27,.07],[.22,.1],[.2,.16],[.17,.2],[.15,.26],[.14,1.66],[.16,1.72],[.21,1.78],[.25,1.84],[.25,1.92],[0,1.92]], 18),
  ball: new THREE.SphereGeometry(1, 20, 14),
  blob: new THREE.IcosahedronGeometry(1, 2),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 24),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  flower: new THREE.IcosahedronGeometry(.07, 0),
  crystal: new THREE.OctahedronGeometry(1, 0),
  arch: arch(.34, .62),
  archBig: arch(.6, 1.1),
  lampPost: lathe([[0,0],[.12,0],[.12,.06],[.06,.1],[.045,.2],[.04,1.25],[.07,1.3],[.07,1.34],[0,1.34]], 10),
  urn: lathe([[0,0],[.18,0],[.18,.05],[.1,.1],[.12,.2],[.24,.34],[.27,.44],[.24,.48],[0,.48]], 16),
  onion: (() => { const pts = []; for (let i = 0; i <= 16; i++){ const t = i / 16; const r = t < .55 ? 1 + Math.sin(t / .55 * Math.PI) * .18 : (1.18 * Math.cos((t - .55) / .45 * Math.PI / 2)) ** 1.6; pts.push([Math.max(.001, r), t * 1.9]); } return lathe(pts, 32); })(),
  dome: new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
  finial: lathe([[0,0],[.09,0],[.05,.12],[.09,.22],[.03,.34],[.05,.42],[.012,.75],[0,.8]], 10)
};
/* gentle sway for foliage, banners and flags */
const uTime = { value: 0 };
function sway(mat, amt = .05, axisY = true){
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
      #else
        vec3 ip = vec3(modelMatrix[3].x, 0., modelMatrix[3].z);
      #endif
      float ph = ip.x * .7 + ip.z * .9;
      ${axisY ? `transformed.x += sin(uTime * 1.3 + ph) * ${amt.toFixed(3)} * (position.y + 1.);
      transformed.z += cos(uTime * 1.1 + ph) * ${(amt * .7).toFixed(3)} * (position.y + 1.);`
      : `transformed.z += sin(uTime * 3.0 + position.y * 4. + ph) * ${amt.toFixed(3)} * (1. - uv.y);`}`);
  };
  return mat;
}

/* ---------- sky, clouds, distant isles ---------- */
const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top:{ value:new THREE.Color('#8f7ae8') }, mid:{ value:new THREE.Color('#c4b2fb') }, hor:{ value:new THREE.Color('#ffd2e2') }, sun:{ value:new THREE.Color('#fff2dc') }, sunDir:{ value:new THREE.Vector3(.55, .12, -.83).normalize() }, uTime },
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `uniform vec3 top, mid, hor, sun, sunDir; uniform float uTime; varying vec3 vD;
    float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
    void main(){
      float y = vD.y;
      vec3 c = mix(hor, mid, smoothstep(-.05, .32, y));
      c = mix(c, top, smoothstep(.3, .85, y));
      c = mix(c, vec3(.78,.7,.98), smoothstep(-.02, -.55, y));
      float s = max(dot(vD, sunDir), 0.);
      c += sun * (pow(s, 18.) * .9 + pow(s, 3.) * .22) * smoothstep(-.2, .1, y);
      vec3 q = floor(vD * 260.); float st = step(.9965, h(q));
      float tw = .6 + .4 * sin(uTime * 2. + h(q + 1.) * 40.);
      c += vec3(1., .95, 1.) * st * tw * smoothstep(.25, .7, y) * 0.;
      gl_FragColor = vec4(c, 1.);
    }`
}));
scene.add(sky);
const clouds = [];
for (let i = 0; i < Math.round(34 * Q); i++){
  const m = new THREE.SpriteMaterial({ map: cloudTex, color: new THREE.Color(pickOne(['#ffffff', '#fff1f7', '#f3ecff', '#ffeede'])), transparent: true, opacity: rr(.55, .85), depthWrite: false, fog: true });
  const s = new THREE.Sprite(m); const a = rnd() * Math.PI * 2, r = rr(24, 80);
  s.position.set(Math.cos(a) * r, rr(-30, -14), Math.sin(a) * r); const k = rr(22, 44); s.scale.set(k, k * .5, 1);
  s.userData = { a, r, v: rr(.004, .012) }; scene.add(s); clouds.push(s);
}

/* ---------- lighting ---------- */
scene.add(new THREE.HemisphereLight(new THREE.Color('#f4eeff'), new THREE.Color('#8a74c9'), .55));
const sunLight = new THREE.DirectionalLight(new THREE.Color('#ffe9cf'), 1.3);
sunLight.position.set(16, 22, 12); sunLight.castShadow = true;
sunLight.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
Object.assign(sunLight.shadow.camera, { left:-19, right:19, top:19, bottom:-19, near:1, far:70 });
sunLight.shadow.bias = -.0004; sunLight.shadow.normalBias = .02;
scene.add(sunLight);
const rim = new THREE.DirectionalLight(new THREE.Color('#ffc2e2'), .4); rim.position.set(-14, 10, -18); scene.add(rim);

/* ---------- world groups ---------- */
const world = new THREE.Group(); scene.add(world);
const L = {};
places.forEach(p => {
  const g = new THREE.Group(); g.position.set(p.x, 0, p.z); world.add(g);
  const light = new THREE.PointLight(new THREE.Color('#ffc98f'), .9, 12, 2); light.position.set(0, 4, 0); g.add(light);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(p.foot * .95, 48), new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color('#f4ce87'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = .06; g.add(halo);
  const proxy = new THREE.Mesh(new THREE.CylinderGeometry(p.foot * .8, p.foot * .8, 8, 12), new THREE.MeshBasicMaterial({ visible: false })); proxy.position.y = 3; proxy.userData.key = p.key; g.add(proxy);
  L[p.key] = { group: g, light, halo, proxy, win: windowMat(), spin: [], lift: 0, glow: 0, baseLight: .9 };
});

/* ---------- paths ---------- */
const pathW = 1.15;
function pathCurve(p, bend){
  const d = new THREE.Vector2(p.x, p.z).normalize(), n = new THREE.Vector2(-d.y, d.x);
  const a = d.clone().multiplyScalar(5.3), b = new THREE.Vector2(p.x, p.z).sub(d.clone().multiplyScalar(p.foot - .2));
  const m = a.clone().lerp(b, .5).add(n.multiplyScalar(bend));
  return new THREE.CatmullRomCurve3([a, a.clone().lerp(m, .5).add(n.clone().multiplyScalar(-.15)), m, b].map(v => new THREE.Vector3(v.x, 0, v.y)));
}
const curves = {
  arena: pathCurve(P.arena, .0), feed: pathCurve(P.feed, .9), hall: pathCurve(P.hall, -.8), shop: pathCurve(P.shop, .7),
  cafe: pathCurve(extra[0], -.6), view: pathCurve(extra[1], 0)
};
const streamCurve = new THREE.CatmullRomCurve3([[-3.0, 3.4], [-3.6, 6.2], [-2.6, 9.0], [-3.4, 11.4], [-3.0, 13.9]].map(v => new THREE.Vector3(v[0], 0, v[1])));
const pathSamples = []; Object.values(curves).forEach(c => c.getSpacedPoints(80).forEach(v => pathSamples.push(v)));
const streamSamples = streamCurve.getSpacedPoints(80);
const discs = [...places, ...extra];

/* ---------- terrain ---------- */
function vnoise(x, z){ const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi; const hsh = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf); return (hsh(xi, zi) * (1 - u) + hsh(xi + 1, zi) * u) * (1 - v) + (hsh(xi, zi + 1) * (1 - u) + hsh(xi + 1, zi + 1) * u) * v; }
const fbm = (x, z) => vnoise(x, z) * .6 + vnoise(x * 2.1 + 5, z * 2.1) * .28 + vnoise(x * 4.3 + 9, z * 4.3) * .12;
function featureDist(x, z){
  let d = 99;
  for (const s of discs){ d = Math.min(d, Math.hypot(x - s.x, z - s.z) - s.foot); }
  for (let i = 0; i < pathSamples.length; i += 2){ const s = pathSamples[i]; d = Math.min(d, Math.hypot(x - s.x, z - s.z) - pathW * .6); }
  for (const s of streamSamples){ d = Math.min(d, Math.hypot(x - s.x, z - s.z) - .8); }
  return d;
}
function heightAt(x, z){
  const r = Math.hypot(x, z);
  const m = smooth(.2, 2.6, featureDist(x, z));
  const hill = Math.max(0, fbm(x * .2 + 3, z * .2 - 2) - .32) * 2.6;
  return hill * m * smooth(R, R - 2.4, r);
}
/* painted ground map */
const S = mobile ? 1024 : 2048, ppu = S / (2 * R);
const toPx = (x, z) => [(x / (2 * R) + .5) * S, (z / (2 * R) + .5) * S];
const groundTex = ctex(S, S, g => {
  const grd = g.createRadialGradient(S/2, S/2, 0, S/2, S/2, S/2); grd.addColorStop(0, '#9a72de'); grd.addColorStop(1, '#7650c4'); g.fillStyle = grd; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++){ const x = rr(0, S), y = rr(0, S), r = rr(8, 60) * ppu / 36; const c = pickOne(['rgba(188,162,244,.16)', 'rgba(92,52,170,.16)', 'rgba(164,232,196,.07)', 'rgba(255,155,203,.06)']); const gr = g.createRadialGradient(x, y, 0, x, y, r * 3); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r * 3, y - r * 3, r * 6, r * 6); }
  for (let i = 0; i < 9000 * Q; i++){ g.fillStyle = pickOne(['rgba(227,209,255,.35)', 'rgba(72,32,128,.25)', 'rgba(164,232,196,.18)']); g.fillRect(rr(0, S), rr(0, S), 1.5, 1.5); }
  /* stream bed */
  g.lineCap = 'round'; g.lineJoin = 'round';
  const line = (pts, w, style) => { g.strokeStyle = style; g.lineWidth = w * ppu; g.beginPath(); pts.forEach((v, i) => { const [px, py] = toPx(v.x, v.z); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke(); };
  line(streamSamples, 1.9, '#d9c8f6'); line(streamSamples, 1.45, '#3c2a7a');
  /* cobble paths with gold edging */
  const cob = document.createElement('canvas'); cob.width = cob.height = 48; const cg = cob.getContext('2d'); cg.fillStyle = '#d9c4ef'; cg.fillRect(0, 0, 48, 48);
  for (let r = 0; r < 4; r++) for (let c = -1; c < 4; c++){ cg.fillStyle = pickOne(['#fbf3ff', '#f1e4fb', '#f6ecf8', '#ecdcf7']); const x = c * 12 + (r % 2) * 6, y = r * 12; cg.beginPath(); cg.roundRect ? cg.roundRect(x + 1, y + 1, 10, 10, 3) : cg.rect(x + 1, y + 1, 10, 10); cg.fill(); }
  const cobble = g.createPattern(cob, 'repeat');
  Object.values(curves).forEach(c => { const pts = c.getSpacedPoints(60); line(pts, pathW + .3, '#e8bf74'); line(pts, pathW, cobble); });
  /* promenade ring */
  const [cx, cy] = toPx(0, 0);
  g.strokeStyle = '#e8bf74'; g.lineWidth = 1.1 * ppu; g.beginPath(); g.arc(cx, cy, 5.15 * ppu, 0, 7); g.stroke();
  g.strokeStyle = cobble; g.lineWidth = .85 * ppu; g.beginPath(); g.arc(cx, cy, 5.15 * ppu, 0, 7); g.stroke();
  /* pads */
  discs.forEach(s => { if (s.key === 'home') return; const [px, py] = toPx(s.x, s.z); g.fillStyle = '#e8bf74'; g.beginPath(); g.arc(px, py, (s.foot - .3) * ppu, 0, 7); g.fill(); g.fillStyle = cobble; g.beginPath(); g.arc(px, py, (s.foot - .45) * ppu, 0, 7); g.fill(); });
});
(function buildTerrain(){
  const rings = mobile ? 44 : 70, segs = mobile ? 120 : 200, pos = [], uv = [], idx = [];
  pos.push(0, heightAt(0, 0), 0); uv.push(.5, .5);
  for (let i = 1; i <= rings; i++){ const r = R * i / rings; for (let j = 0; j < segs; j++){ const a = j / segs * Math.PI * 2, x = Math.sin(a) * r, z = Math.cos(a) * r; pos.push(x, heightAt(x, z), z); uv.push(x / (2 * R) + .5, .5 - z / (2 * R)); } }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + j, 1 + (j + 1) % segs);
  for (let i = 1; i < rings; i++){ const a0 = 1 + (i - 1) * segs, a1 = 1 + i * segs; for (let j = 0; j < segs; j++){ const j2 = (j + 1) % segs; idx.push(a0 + j, a1 + j, a1 + j2, a0 + j, a1 + j2, a0 + j2); } }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const t = mesh(geo, new THREE.MeshStandardMaterial({ map: groundTex, roughness: .92, envMapIntensity:0.14 })); t.castShadow = false; world.add(t);
})();

/* sculpted underside */
(function buildRock(){
  const rings = 14, segs = mobile ? 72 : 120, pos = [], col = [], idx = [];
  const cTop = new THREE.Color('#8b62d6'), cMid = new THREE.Color('#5a33a6'), cLow = new THREE.Color('#2c1660'), band = new THREE.Color('#bca2f4');
  for (let i = 0; i <= rings; i++){
    const t = i / rings;
    for (let j = 0; j < segs; j++){
      const a = j / segs * Math.PI * 2;
      const n = fbm(Math.cos(a) * 3 + i * .4, Math.sin(a) * 3 + i * .3);
      const r = i === 0 ? R : R * Math.pow(1 - t, 1.25) * (0.86 + n * .3) + .2;
      const y = i === 0 ? .02 : -.35 - t * 12 - n * 1.4 * t;
      pos.push(Math.sin(a) * r, y, Math.cos(a) * r);
      const c = t < .5 ? cTop.clone().lerp(cMid, t * 2) : cMid.clone().lerp(cLow, (t - .5) * 2);
      if (Math.abs(Math.sin(y * 2.3 + n * 3)) > .93) c.lerp(band, .35);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++){ const a = i * segs + j, b = i * segs + (j + 1) % segs, c = a + segs, d = b + segs; idx.push(a, b, c, b, d, c); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx);
  const ng = geo.toNonIndexed(); ng.computeVertexNormals();
  const m = mesh(ng, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, flatShading: true, envMapIntensity:0.21 })); m.receiveShadow = false; world.add(m);
  /* cornice and gold band around the rim */
  const cor = mesh(new THREE.TorusGeometry(R, .2, 10, 160), MAT.cream, 0, -.02, 0, world); cor.rotation.x = Math.PI / 2;
  const gb = mesh(new THREE.TorusGeometry(R - .06, .05, 8, 160), MAT.gold, 0, -.3, 0, world); gb.rotation.x = Math.PI / 2;
  /* crystals */
  const cl = [];
  for (let i = 0; i < 70 * Q; i++){ const a = rnd() * Math.PI * 2, t = rr(.25, .95), r = R * Math.pow(1 - t, 1.25) * .9; const k = rr(.25, .8);
    cl.push({ p:[Math.sin(a) * r, -.4 - t * 12, Math.cos(a) * r], r:[rr(-.6,.6) + Math.PI, a, rr(-.6, .6)], s:[k * .35, k * 1.2, k * .35], c: pickOne(['#79e8ec', '#bca2f4', '#ff9bcb', '#79e8ec']) }); }
  for (let i = 0; i < 9; i++) cl.push({ p:[rr(-.6,.6), -12.6 + rr(-.6, .3), rr(-.6,.6)], r:[Math.PI + rr(-.4,.4), rr(0, 6), rr(-.4, .4)], s:[.5, rr(1.6, 2.6), .5], c: i % 2 ? '#79e8ec' : '#bca2f4' });
  const cm = MAT.crystal.clone(); cm.emissiveIntensity = 1.4;
  world.add(inst(G.crystal, cm, cl, false));
  /* hanging vines */
  const leaves = [];
  for (let i = 0; i < 64 * Q; i++){ const a = rnd() * Math.PI * 2, len = Math.floor(rr(5, 15));
    for (let k = 0; k < len; k++){ const r = R + .12 - k * .045; leaves.push({ p:[Math.sin(a) * r + rr(-.08,.08), -.25 - k * .2, Math.cos(a) * r + rr(-.08,.08)], s: rr(.08, .14), c: k % 5 === 4 ? pickOne(['#ff9bcb', '#f4ce87', '#fff5e9']) : pickOne(['#6fbf9c', '#8a6ad8', '#5aa889', '#9b7fe6']) }); } }
  world.add(inst(G.blob, sway(new THREE.MeshStandardMaterial({ roughness: .8 }), .02), leaves, false));
})();

/* ---------- water ---------- */
const waterMat = new THREE.ShaderMaterial({
  uniforms: { uTime, deep:{ value:new THREE.Color('#4a2fa0') }, shallow:{ value:new THREE.Color('#79e8ec') }, skyc:{ value:new THREE.Color('#ffc6e6') } },
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `uniform float uTime; uniform vec3 deep, shallow, skyc; varying vec3 vW;
    void main(){
      vec3 V = normalize(cameraPosition - vW);
      float fres = pow(1. - clamp(V.y, 0., 1.), 2.5);
      vec2 p = vW.xz * 2.4;
      float r = sin(p.x + uTime * 1.1) * sin(p.y * 1.3 - uTime * .8) + .5 * sin(p.x * 2.3 - p.y * 1.7 + uTime * 1.6);
      vec3 c = mix(deep, shallow, .35 + .18 * r);
      c = mix(c, skyc, fres * .55 + .08);
      c += vec3(1., .96, 1.) * pow(max(r, 0.), 7.) * .55;
      gl_FragColor = vec4(c, 1.);
    }`
});
function ribbon(curve, w, y, n = 120){
  const pts = curve.getSpacedPoints(n), pos = [], idx = [], up = new THREE.Vector3(0, 1, 0);
  pts.forEach((p, i) => { const t = curve.getTangentAt(i / n); const s = new THREE.Vector3().crossVectors(t, up).normalize().multiplyScalar(w / 2); pos.push(p.x - s.x, y, p.z - s.z, p.x + s.x, y, p.z + s.z); if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
world.add(new THREE.Mesh(ribbon(streamCurve, 1.35, .07), waterMat));
/* waterfall off the front edge */
const fallEnd = streamCurve.getPointAt(1);
const fallMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `uniform float uTime; varying vec2 vUv; void main(){ float s = fract(vUv.y * 6. + uTime * 1.4 + sin(vUv.x * 20.) * .15); float a = (.35 + .4 * smoothstep(.6, 1., s)) * smoothstep(0., .2, vUv.y) * smoothstep(0., .12, vUv.x) * smoothstep(1., .88, vUv.x);
    gl_FragColor = vec4(mix(vec3(.55,.8,1.), vec3(.95,.9,1.), s * .5), a * .5); }` });
const fall = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 10, 1, 1), fallMat); fall.position.set(fallEnd.x, -5, fallEnd.z + .25); world.add(fall);
const mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color('#d8f6ff'), transparent: true, opacity: .45, depthWrite: false })); mist.position.set(fallEnd.x, -9.5, fallEnd.z + .4); mist.scale.set(5, 3, 1); world.add(mist);

/* particle helper for fountains and the waterfall spray */
function sprayPoints(n, origin, opts){
  const g = new THREE.BufferGeometry(), seeds = new Float32Array(n * 4);
  for (let i = 0; i < n; i++){ seeds[i * 4] = rnd() * Math.PI * 2; seeds[i * 4 + 1] = rnd(); seeds[i * 4 + 2] = rr(.8, 1.2); seeds[i * 4 + 3] = rnd(); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 4));
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime, uOrigin:{ value: origin }, uSpread:{ value: opts.spread }, uUp:{ value: opts.up }, uSize:{ value: opts.size * renderer.getPixelRatio() }, uCol:{ value: new THREE.Color(opts.color) }, uRate:{ value: opts.rate } },
    vertexShader: `attribute vec4 aSeed; uniform float uTime, uSpread, uUp, uSize, uRate; uniform vec3 uOrigin; varying float vA;
      void main(){ float t = fract(uTime * uRate * aSeed.z + aSeed.y); vec3 d = vec3(cos(aSeed.x), 0., sin(aSeed.x));
        vec3 p = uOrigin + d * uSpread * t * (.7 + .3 * aSeed.w) + vec3(0., uUp * t - 4.9 * t * t * (uUp > 0. ? 1. : .4), 0.);
        vA = (1. - t) * .9; vec4 mv = modelViewMatrix * vec4(p, 1.); gl_PointSize = uSize * (1. + aSeed.w) * (60. / -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uCol; varying float vA; void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(uCol, vA * smoothstep(.5, 0., d)); }` });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; return pts;
}
world.add(sprayPoints(Math.round(260 * Q), new THREE.Vector3(fallEnd.x, -9.2, fallEnd.z + .3), { spread: 1.6, up: 2.2, size: 3, color: '#e9fbff', rate: .7 }));

/* ---------- lamps, lantern strings, foliage ---------- */
const lampSpots = [];
Object.entries(curves).forEach(([k, c]) => { const n = Math.floor(c.getLength() / 2.3); for (let i = 1; i <= n; i++){ const u = i / (n + 1), p = c.getPointAt(u), t = c.getTangentAt(u); const side = i % 2 ? 1 : -1; lampSpots.push([p.x - t.z * side * (pathW / 2 + .32), p.z + t.x * side * (pathW / 2 + .32)]); } });
for (let i = 0; i < 12; i++){ const a = i / 12 * Math.PI * 2 + .26; lampSpots.push([Math.sin(a) * 5.85, Math.cos(a) * 5.85]); }
world.add(inst(G.lampPost, MAT.goldDark, lampSpots.map(([x, z]) => ({ p:[x, 0, z], s:[1, 1.15, 1] }))));
world.add(inst(G.ball, MAT.lampGlass, lampSpots.map(([x, z]) => ({ p:[x, 1.62, z], s: .13 })), false));
world.add(inst(G.cyl8, MAT.gold, lampSpots.map(([x, z]) => ({ p:[x, 1.79, z], s:[.1, .06, .1] })), false));

function lanternString(a, b, sag, n){
  const mid = a.clone().lerp(b, .5); mid.y -= sag; const c = new THREE.QuadraticBezierCurve3(a, mid, b);
  world.add(mesh(new THREE.TubeGeometry(c, 20, .012, 4), MAT.dark));
  const cols = ['#f4ce87', '#ff9bcb', '#79e8ec', '#fff5e9', '#a4e8c4'];
  return Array.from({ length: n }, (_, i) => { const p = c.getPointAt((i + .5) / n); return { p:[p.x, p.y - .07, p.z], s: .075, c: cols[i % cols.length] }; });
}
const bulbs = [];
const plazaR = 4.0;
/* lantern strings around the plaza between lamps */
for (let i = 0; i < 12; i += 2){ const a0 = i / 12 * Math.PI * 2 + .26, a1 = (i + 1) / 12 * Math.PI * 2 + .26; bulbs.push(...lanternString(new THREE.Vector3(Math.sin(a0) * 5.85, 1.72, Math.cos(a0) * 5.85), new THREE.Vector3(Math.sin(a1) * 5.85, 1.72, Math.cos(a1) * 5.85), .45, 9)); }

/* trees */
function treeSpots(n, minFeature){ const out = []; let guard = 0; while (out.length < n && guard++ < n * 60){ const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (R - 1.1); const x = Math.sin(a) * r, z = Math.cos(a) * r; if (featureDist(x, z) < minFeature) continue; if (out.some(o => Math.hypot(o[0] - x, o[1] - z) < 1.15)) continue; out.push([x, z]); } return out; }
const trunks = [], canopy = [], blossom = [], cypress = [];
treeSpots(Math.round(78 * Q), .7).forEach(([x, z], i) => {
  const y = heightAt(x, z), kind = i % 7 === 0 ? 'cyp' : i % 3 === 0 ? 'blossom' : 'round', s = rr(.75, 1.15);
  if (kind === 'cyp'){ const c = pickOne(['#5e36b0', '#6fc9a0', '#7040c8']); trunks.push({ p:[x, y + .3, z], s:[.06, .6, .06] }); [[.55, .42], [1.05, .32], [1.45, .22]].forEach(([h, r]) => cypress.push({ p:[x, y + h * s, z], s: r * s, c })); return; }
  trunks.push({ p:[x, y + .45 * s, z], s:[.09 * s, .9 * s, .09 * s] });
  const list = kind === 'blossom' ? blossom : canopy;
  const cols = kind === 'blossom' ? ['#ff8fc3', '#f77fb6', '#ffa8d0', '#e870a8'] : ['#7040c8', '#8955d8', '#9a6ee0', '#5e36b0', '#6fc9a0'];
  const blobs = 5 + Math.floor(rnd() * 3);
  for (let b = 0; b < blobs; b++){ const ang = b / blobs * Math.PI * 2 + rnd(); const rad = b === 0 ? 0 : rr(.25, .5) * s; const k = rr(.42, .6) * s;
    list.push({ p:[x + Math.cos(ang) * rad, y + (1.05 + rr(0, .45)) * s + (b === 0 ? .25 * s : 0), z + Math.sin(ang) * rad], s:k, c: b === blobs - 1 && kind !== 'blossom' && rnd() < .25 ? '#a4e8c4' : pickOne(cols.slice(0, 4)) }); }
});
world.add(inst(G.cyl, MAT.trunk, trunks));
world.add(inst(G.blob, sway(new THREE.MeshStandardMaterial({ roughness: .75, envMapIntensity:0.17 }), .03), canopy));
world.add(inst(G.blob, sway(new THREE.MeshStandardMaterial({ roughness: .7, envMapIntensity:0.17, emissive: new THREE.Color('#ff7fbf'), emissiveIntensity: .08 }), .03), blossom));
world.add(inst(G.ball, sway(new THREE.MeshStandardMaterial({ roughness: .8 }), .015), cypress));
/* flowers in garden beds */
const flowers = [];
for (let b = 0; b < 46 * Q; b++){ const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (R - 1.4); const cx = Math.sin(a) * r, cz = Math.cos(a) * r; if (featureDist(cx, cz) < .35) continue;
  const col = pickOne([['#ff9bcb', '#ffd0e6'], ['#f4ce87', '#fff5e9'], ['#79e8ec', '#e3d1ff'], ['#ffad91', '#ff9bcb'], ['#fff5e9', '#bca2f4']]);
  for (let i = 0; i < 46 * Q; i++){ const x = cx + rr(-1, 1) * 1.1, z = cz + rr(-1, 1) * .8; if (featureDist(x, z) < .2 || Math.hypot(x, z) > R - .6) continue; flowers.push({ p:[x, heightAt(x, z) + .07, z], s: rr(.7, 1.3), c: pickOne(col) }); } }
/* flowers lining paths */
Object.values(curves).forEach(c => { const n = Math.floor(c.getLength() * 9 * Q); for (let i = 0; i < n; i++){ const u = rnd(), p = c.getPointAt(u), t = c.getTangentAt(u), side = rnd() < .5 ? 1 : -1, off = pathW / 2 + rr(.25, .6); const x = p.x - t.z * side * off, z = p.z + t.x * side * off; if (featureDist(x, z) < -0.05 && Math.hypot(x - p.x, z - p.z) < .7) {} flowers.push({ p:[x, heightAt(x, z) + .07, z], s: rr(.6, 1.1), c: pickOne(['#ff9bcb', '#f4ce87', '#79e8ec', '#fff5e9', '#ffad91']) }); } });
const fm = new THREE.MeshStandardMaterial({ roughness: .5, emissive: new THREE.Color('#ffffff'), emissiveIntensity: .12 });
world.add(inst(G.flower, fm, flowers, false));
/* low hedges along the promenade */
const hedges = []; for (let i = 0; i < 24; i++){ const a = i / 24 * Math.PI * 2 + .13; if (places.slice(1).concat(extra).some(p => Math.abs(Math.atan2(Math.sin(a - Math.atan2(p.x, p.z)), Math.cos(a - Math.atan2(p.x, p.z)))) < .2)) continue; hedges.push({ p:[Math.sin(a) * 6.25, .22, Math.cos(a) * 6.25], r:[0, a + Math.PI / 2, 0], s:[.85, .26, .26] }); }


/* ---------- Chog characters ---------- */
/* Chog, modelled on the official art: spiky purple mane, cream face mask, big glossy eyes, pink cheeks and nose, small rounded body */
function mergeGeos(list){
  const pos = [], nor = [];
  list.forEach(([geo, m]) => { const ng = geo.index ? geo.toNonIndexed() : geo.clone(); ng.applyMatrix4(m); pos.push(...ng.attributes.position.array); nor.push(...ng.attributes.normal.array); });
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return out;
}
const chogGeo = (() => {
  const parts = [], up = new THREE.Vector3(0, 1, 0);
  parts.push([new THREE.SphereGeometry(.8, 28, 20), new THREE.Matrix4()]);
  const spike = (dir, len, rad, base = .58) => { dir.normalize(); const q = new THREE.Quaternion().setFromUnitVectors(up, dir); const p = dir.clone().multiplyScalar(base + len / 2);
    parts.push([new THREE.ConeGeometry(rad, len, 10), new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, .75))]); };
  /* crown and side spikes fan out wide like the art; none over the face */
  const fan = [[-1, .15, -.1], [1, .15, -.1], [-1, .55, 0], [1, .55, 0], [-.75, .95, -.05], [.75, .95, -.05], [-.35, 1, .05], [.35, 1, .05], [0, 1, -.2], [-1, -.25, -.2], [1, -.25, -.2]];
  fan.forEach(([x, y, z], i) => spike(new THREE.Vector3(x, y, z), i < 2 ? 1.0 : .85 + (i % 3) * .08, .3));
  for (let i = 0; i < 9; i++){ const a = Math.PI * .55 + i / 8 * Math.PI * .9; spike(new THREE.Vector3(Math.cos(a), .25 + (i % 3) * .3, -Math.abs(Math.sin(a)) - .4), .7, .3); }
  /* fringe dipping into the top of the face */
  [[-.24, .62, .7, -.15], [.12, .66, .72, .1], [.36, .58, .6, .25]].forEach(([x, y, z, tilt]) => parts.push([new THREE.ConeGeometry(.17, .42, 8), new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI - .55, 0, tilt)), new THREE.Vector3(1, 1, .7))]));
  return {
    mane: mergeGeos(parts),
    face: new THREE.SphereGeometry(1, 32, 24),
    body: lathe([[0,0],[.42,0],[.52,.08],[.56,.3],[.5,.6],[.36,.82],[0,.86]], 24),
    ball: new THREE.SphereGeometry(1, 16, 12),
    smile: new THREE.TorusGeometry(.09, .022, 6, 16, Math.PI),
    nose: new THREE.ConeGeometry(.045, .06, 3)
  };
})();
const chogMats = {};
const cm = hex => chogMats[hex] || (chogMats[hex] = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: .5, envMapIntensity:0.24 }));
const faceMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#fff2d8'), roughness: .55, envMapIntensity:0.21 });
const eyeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#14091f'), roughness: .08, metalness: .1, envMapIntensity:0.56 });
const pinkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#e85a8f'), roughness: .5 });
const cheekMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#e0507d'), roughness: .6, transparent: true, opacity: .8 });
const allChogs = [];
function makeChog(color, opts = {}){
  const g = new THREE.Group(), c = new THREE.Group(); c.scale.setScalar(.82); g.add(c); g.userData.inner = c; allChogs.push({ g, opts });
  const mat = opts.mat || cm(color), face = opts.gold ? mat : faceMat;
  mesh(chogGeo.body, mat, 0, 0, 0, c).scale.set(1, 1, .9);
  mesh(chogGeo.mane, mat, 0, 1.5, -.08, c);
  const f = mesh(chogGeo.face, face, 0, 1.36, .3, c); f.scale.set(.6, .52, .52);
  if (!opts.gold){
    [-1, 1].forEach(s => {
      const e = mesh(chogGeo.ball, eyeMat, s * .2, 1.42, .74, c); e.scale.set(.1, .14, .06); e.castShadow = false;
      const h = mesh(chogGeo.ball, MAT.white, s * .2 + .03, 1.48, .79, c); h.scale.setScalar(.035); h.castShadow = false;
      const h2 = mesh(chogGeo.ball, MAT.white, s * .2 - .025, 1.37, .795, c); h2.scale.setScalar(.016); h2.castShadow = false;
      const ck = mesh(chogGeo.ball, cheekMat, s * .36, 1.27, .62, c); ck.scale.set(.085, .065, .03); ck.rotation.y = s * .5; ck.castShadow = false;
    });
    const n = mesh(chogGeo.nose, pinkMat, 0, 1.3, .81, c); n.rotation.x = Math.PI / 2 + .2; n.rotation.y = Math.PI; n.castShadow = false;
    const m = mesh(chogGeo.smile, MAT.dark, .03, opts.frown ? 1.16 : 1.22, .8, c); m.rotation.z = opts.frown ? 0 : Math.PI; m.castShadow = false;
  }
  g.scale.setScalar(opts.scale || 1); return g;
}
const palette = ['#5b3ab8', '#6a45c9', '#7040c8', '#4e2fa8', '#8955d8', '#5b3ab8', '#ff9bcb', '#79e8ec', '#a4e8c4', '#f4ce87'];
const walkers = [];
function addWalker(curve, opts = {}){ const c = makeChog(pickOne(palette), { scale: rr(.2, .26) }); world.add(c); walkers.push({ c, curve, u: rnd(), v: rr(.018, .035) * (rnd() < .5 ? 1 : -1), lane: rr(-.28, .28), hop: rnd() * 6, ring: opts.ring }); }
Object.values(curves).forEach(cv => { for (let i = 0; i < (mobile ? 1 : 3); i++) addWalker(cv); });
for (let i = 0; i < (mobile ? 3 : 7); i++) addWalker(null, { ring: rr(4.95, 5.35) });
function sitChog(x, y, z, face, k = .24){ const c = makeChog(pickOne(palette), { scale: k }); c.position.set(x, y, z); c.rotation.y = face; c.userData.bob = rnd() * 6; world.add(c); return c; }
const sitters = [];

/* ---------- 1. Heart plaza: Your Chogmate ---------- */
(function(){
  const g = L.home.group;
  const inlay = ctex(1024, 1024, (c, w) => {
    const m = w / 2; c.fillStyle = '#efe4fb'; c.fillRect(0, 0, w, w);
    for (let i = 0; i < 300; i++){ c.fillStyle = `rgba(137,85,216,${rr(0,.04)})`; c.beginPath(); c.arc(rr(0,w), rr(0,w), rr(5,40), 0, 7); c.fill(); }
    c.translate(m, m);
    [[.98, '#c99a52', 10], [.86, '#e8bf74', 6], [.62, '#c99a52', 5], [.5, '#e8bf74', 3]].forEach(([r, col, lw]) => { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.arc(0, 0, r * m, 0, 7); c.stroke(); });
    for (let i = 0; i < 16; i++){ c.save(); c.rotate(i / 16 * Math.PI * 2); c.fillStyle = i % 2 ? 'rgba(137,85,216,.55)' : 'rgba(188,162,244,.6)'; c.beginPath(); c.moveTo(0, -.5 * m); c.lineTo(.07 * m, -.74 * m); c.lineTo(0, -.86 * m); c.lineTo(-.07 * m, -.74 * m); c.closePath(); c.fill(); c.restore(); }
    for (let i = 0; i < 48; i++){ c.save(); c.rotate(i / 48 * Math.PI * 2); c.fillStyle = '#e8bf74'; c.beginPath(); c.arc(0, -.92 * m, 6, 0, 7); c.fill(); c.restore(); }
  });
  const disc = mesh(new THREE.CylinderGeometry(plazaR, plazaR, .16, 96), [MAT.cream, new THREE.MeshStandardMaterial({ map: inlay, roughness: .25, envMapIntensity:0.32 }), MAT.cream], 0, .08, 0, g);
  /* canal ring with marble walls */
  const water = new THREE.Mesh(new THREE.RingGeometry(plazaR, 4.75, 96), waterMat); water.rotation.x = -Math.PI / 2; water.position.y = .1; g.add(water);
  const w1 = mesh(new THREE.TorusGeometry(plazaR, .09, 8, 96), MAT.gold, 0, .17, 0, g); w1.rotation.x = Math.PI / 2;
  const w2 = mesh(new THREE.CylinderGeometry(4.82, 4.82, .32, 96, 1, true), MAT.marble, 0, .1, 0, g);
  const w3 = mesh(new THREE.TorusGeometry(4.82, .08, 8, 96), MAT.cream, 0, .27, 0, g); w3.rotation.x = Math.PI / 2;
  /* bridges over the canal toward each district */
  [...places.slice(1), ...extra].forEach(p => {
    const a = Math.atan2(p.x, p.z), br = new THREE.Group(); br.rotation.y = a; g.add(br);
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.2, 24, 1, false, -Math.PI * .22, Math.PI * .44), MAT.cream);
    deck.rotation.z = Math.PI / 2; deck.position.set(0, -1.12, 4.38); deck.scale.set(1, 1, .9); deck.castShadow = deck.receiveShadow = true; br.add(deck);
    [-1, 1].forEach(s => { const rail = mesh(new THREE.TorusGeometry(1.42, .03, 6, 20, Math.PI * .44), MAT.gold, s * .58, -1.12 + .3, 4.38, br); rail.rotation.y = Math.PI / 2; rail.rotation.z = Math.PI / 2 - Math.PI * .22;
      [-.5, .5].forEach(o => mesh(G.urn, MAT.gold, s * .58, .15, 4.38 + o * 1.25, br).scale.setScalar(.45)); });
  });
  /* tiered fountain */
  mesh(lathe([[0,0],[2.05,0],[2.05,.42],[1.9,.46],[1.85,.3],[0,.3]], 64), MAT.marble, 0, .16, 0, g);
  mesh(new THREE.TorusGeometry(2.0, .06, 8, 80), MAT.gold, 0, .6, 0, g).rotation.x = Math.PI / 2;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.86, 64), waterMat); pool.rotation.x = -Math.PI / 2; pool.position.y = .55; g.add(pool);
  mesh(lathe([[0,0],[.42,0],[.32,.2],[.26,.9],[.3,1.0],[.95,1.18],[1.05,1.32],[.98,1.36],[.3,1.24],[.24,1.6],[.3,1.7],[0,1.7]], 48), MAT.marbleV, 0, .45, 0, g);
  mesh(new THREE.TorusGeometry(1.0, .035, 6, 60), MAT.gold, 0, 1.79, 0, g).rotation.x = Math.PI / 2;
  const bowl = new THREE.Mesh(new THREE.CircleGeometry(.94, 48), waterMat); bowl.rotation.x = -Math.PI / 2; bowl.position.y = 1.77; g.add(bowl);
  mesh(lathe([[0,0],[.36,0],[.36,.08],[.3,.12],[.3,.5],[.38,.56],[.38,.62],[0,.62]], 24), MAT.gold, 0, 2.15, 0, g);
  g.add(sprayPoints(Math.round(420 * Q), new THREE.Vector3(0, 2.3, 0), { spread: .95, up: 2.6, size: 2.2, color: '#d9fbff', rate: .55 }));
  g.add(sprayPoints(Math.round(260 * Q), new THREE.Vector3(0, 1.76, 0), { spread: 1.6, up: 1.4, size: 1.8, color: '#e6f6ff', rate: .7 }));
  /* the Chogmate on top */
  const hero = makeChog('#5b3ab8', { scale: .62, frown: true, mat: new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#5b3ab8'), roughness: .32, clearcoat: .6, clearcoatRoughness: .25, envMapIntensity:0.35 }) });
  hero.position.y = 2.77; g.add(hero); L.home.hero = hero;
  const hatSlot = new THREE.Group(); hatSlot.position.y = 2.3; hero.userData.inner.add(hatSlot); L.home.hatSlot = hatSlot;
  const aura = new THREE.Mesh(new THREE.TorusGeometry(.62, .025, 8, 64), new THREE.MeshStandardMaterial({ color: '#f4ce87', emissive: new THREE.Color('#f4ce87'), emissiveIntensity: 2.6 }));
  aura.rotation.x = Math.PI / 2; aura.position.y = 2.82; g.add(aura); L.home.aura = aura;
  L.home.spin.push(t => { aura.rotation.z = t * .5; aura.position.y = 2.82 + Math.sin(t * 1.4) * .04; });
  /* colonnade arc behind the fountain (north side), open toward the camera */
  const arcStart = Math.PI * .62, arcLen = Math.PI * .76, cols = 11, cr = 3.55;
  const colList = []; for (let i = 0; i < cols; i++){ const a = arcStart + i / (cols - 1) * arcLen; colList.push({ p:[Math.sin(a) * cr, .16, Math.cos(a) * cr], s:[1, 1.15, 1] }); }
  g.add(inst(G.column, MAT.marble, colList));
  g.add(inst(new THREE.TorusGeometry(.2, .035, 6, 16), MAT.gold, colList.map(c => ({ p:[c.p[0], 2.2, c.p[2]], r:[Math.PI / 2, 0, 0] })), false));
  const ent = mesh(new THREE.CylinderGeometry(cr + .32, cr + .32, .34, 64, 1, true, arcStart - .12, arcLen + .24), MAT.amethyst, 0, 2.48, 0, g); ent.material = MAT.amethyst;
  mesh(new THREE.CylinderGeometry(cr + .34, cr + .34, .06, 64, 1, true, arcStart - .12, arcLen + .24), MAT.gold, 0, 2.68, 0, g);
  mesh(new THREE.CylinderGeometry(cr + .34, cr + .34, .05, 64, 1, true, arcStart - .12, arcLen + .24), MAT.gold, 0, 2.3, 0, g);
  const entIn = new THREE.Mesh(new THREE.CylinderGeometry(cr - .3, cr - .3, .34, 64, 1, true, arcStart - .12, arcLen + .24), MAT.amethyst); entIn.material.side = THREE.DoubleSide; entIn.position.y = 2.48; g.add(entIn);
  /* urns with glowing flowers, benches, sitters */
  const urnSpots = []; for (let i = 0; i < 8; i++){ const a = i / 8 * Math.PI * 2 + Math.PI / 8; if (a > arcStart - .1 && a < arcStart + arcLen + .1) continue; urnSpots.push([Math.sin(a) * 3.55, Math.cos(a) * 3.55]); }
  g.add(inst(G.urn, MAT.gold, urnSpots.map(([x, z]) => ({ p:[x, .16, z], s: 1.1 }))));
  const glowF = []; urnSpots.forEach(([x, z]) => { for (let i = 0; i < 14; i++) glowF.push({ p:[x + rr(-.22,.22), .7 + rr(0, .22), z + rr(-.22,.22)], s: rr(.9, 1.6), c: pickOne(['#ff9bcb', '#79e8ec', '#f4ce87', '#e3d1ff']) }); });
  const gfm = new THREE.MeshStandardMaterial({ roughness: .4, emissive: new THREE.Color('#ffffff'), emissiveIntensity: .55 }); g.add(inst(G.flower, gfm, glowF, false));
  const benchA = [-.55, .55, Math.PI - .55, Math.PI + .55];
  benchA.forEach(a => {
    const b = new THREE.Group(); b.position.set(Math.sin(a) * 2.75, .16, Math.cos(a) * 2.75); b.rotation.y = a; g.add(b);
    mesh(new THREE.CylinderGeometry(2.75, 2.75, .07, 16, 1, false, -.28, .56), MAT.amethyst, 0, .34, -2.75, b);
    const back = mesh(new THREE.CylinderGeometry(2.97, 2.97, .2, 16, 1, true, -.28, .56), MAT.cream, 0, .52, -2.75, b); back.material = MAT.cream.clone(); back.material.side = THREE.DoubleSide;
    [-.6, .6].forEach(o => mesh(G.box, MAT.gold, o, .16, 0, b).scale.set(.06, .32, .3));
  });
  sitters.push(sitChog(Math.sin(-.55) * 2.6, .55, Math.cos(-.55) * 2.6, -.55 + Math.PI));
  sitters.push(sitChog(Math.sin(.55) * 2.6, .55, Math.cos(.55) * 2.6, .55 + Math.PI, .22));
  sitters.push(sitChog(Math.sin(Math.PI + .5) * 2.6, .55, Math.cos(Math.PI + .5) * 2.6, .5, .23));
})();
function setHat(kind){
  const s = L.home.hatSlot; while (s.children.length) s.remove(s.children[0]);
  if (kind === 'party'){ const h = mesh(new THREE.ConeGeometry(.36, .9, 32), MAT.roseMetal, 0, .44, 0, s); h.rotation.z = .12; mesh(G.ball, MAT.gold, .06, .92, 0, s).scale.setScalar(.1); mesh(new THREE.TorusGeometry(.33, .04, 8, 32), MAT.gold, 0, .06, 0, s).rotation.x = Math.PI / 2; }
  if (kind === 'crown'){ mesh(new THREE.CylinderGeometry(.4, .38, .26, 32, 1, true), MAT.gold, 0, .13, 0, s).material = MAT.gold; for (let i = 0; i < 6; i++){ const a = i / 6 * Math.PI * 2; mesh(new THREE.ConeGeometry(.07, .22, 8), MAT.gold, Math.sin(a) * .39, .36, Math.cos(a) * .39, s); mesh(G.ball, new THREE.MeshStandardMaterial({ color: '#79e8ec', emissive: new THREE.Color('#79e8ec'), emissiveIntensity: 1.5 }), Math.sin(a) * .4, .12, Math.cos(a) * .4, s).scale.setScalar(.045); } }
  if (kind === 'chef'){ mesh(new THREE.CylinderGeometry(.34, .34, .32, 32), MAT.cream, 0, .14, 0, s); [[-.18, 0], [.18, 0], [0, .16], [0, -.14], [0, 0]].forEach(([x, z]) => mesh(G.ball, MAT.cream, x, .46, z, s).scale.setScalar(.27)); }
}
function setAura(key){ const hex = auras.find(a => a[0] === key)[2]; L.home.aura.material.color.set(hex); L.home.aura.material.emissive.set(hex); L.home.light.color.set(hex); }
setHat(look.hat); setAura(look.aura);
/* when NEXT_PUBLIC_CHOG_GLB points at a modelled Chog (e.g. /chog.glb in public/), it replaces the built-in Chogs */
(function loadModel(){
    const url = process.env.NEXT_PUBLIC_CHOG_GLB; if (!url) return;
  Promise.resolve().then(() => {
    new GLTFLoader().load(url, gltf => {
      const src = gltf.scene; src.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(src), size = box.getSize(new THREE.Vector3());
      const k = 2.55 / Math.max(size.y, .001);
      src.scale.multiplyScalar(k); src.updateMatrixWorld(true);
      const b2 = new THREE.Box3().setFromObject(src), ctr = b2.getCenter(new THREE.Vector3());
      src.position.sub(new THREE.Vector3(ctr.x, b2.min.y, ctr.z));
      src.traverse(o => { if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; if (o.material){ o.material.envMapIntensity = .5; if (o.material.map) o.material.map.anisotropy = 8; } } });
      const goldChog = new THREE.MeshStandardMaterial({ color: '#f4ce87', metalness: 1, roughness: .22, envMapIntensity: 1.1 });
      allChogs.forEach(({ g, opts }) => {
        const inner = g.userData.inner, keep = inner.children.filter(ch => ch === L.home.hatSlot);
        while (inner.children.length) inner.remove(inner.children[0]);
        const m = src.clone(true); m.scale.multiplyScalar(1 / .82);
        if (opts.gold) m.traverse(o => { if (o.isMesh) o.material = goldChog; });
        inner.add(m); keep.forEach(h => { h.position.y = 2.6 / .82 * .82; inner.add(h); });
      });
    });
  }).catch(() => {});
})();

/* ---------- 2. Royal Amphitheatre ---------- */
(function(){
  const g = L.arena.group, gap = Math.PI * .5;
  mesh(lathe([[0,0],[4.3,0],[4.3,.85],[4.15,.95],[0,.95]], 72), MAT.stone, 0, 0, 0, g);
  mesh(new THREE.TorusGeometry(4.22, .06, 8, 96), MAT.gold, 0, .95, 0, g).rotation.x = Math.PI / 2;
  for (let i = 0; i < 6; i++) mesh(G.box, MAT.cream, 0, .08 + i * .16, 4.4 + (5 - i) * .22, g).scale.set(2.3, .16, .28 + (5 - i) * .44 > 0 ? .44 : .44);
  [-1, 1].forEach(s => { mesh(G.urn, MAT.gold, s * 1.35, .95, 4.05, g).scale.setScalar(.9); });
  const tiers = []; let r = 1.7, y = 0; tiers.push([r, y]); for (let i = 0; i < 6; i++){ y += .26; tiers.push([r, y]); r += .32; tiers.push([r, y]); }
  tiers.push([r + .1, y]); tiers.push([r + .1, 0]);
  const seats = lathe(tiers.map(([a, b]) => [a, b]), 64, gap / 2, Math.PI * 2 - gap); const sm = mesh(seats, MAT.marble, 0, .95, 0, g); sm.material = MAT.marble.clone(); sm.material.side = THREE.DoubleSide;
  const cush = new THREE.Group(); cush.rotation.y = -Math.PI / 2 + gap / 2; cush.position.y = .95; g.add(cush);
  for (let i = 0; i < 6; i++){ const t = mesh(new THREE.TorusGeometry(1.86 + i * .32, .07, 6, 64, Math.PI * 2 - gap), i % 2 ? MAT.rose : new THREE.MeshStandardMaterial({ color: '#7040c8', roughness: .6 }), 0, .27 + i * .26, 0, cush); t.rotation.x = -Math.PI / 2; t.scale.z = .6; }
  const stage = mesh(new THREE.CylinderGeometry(1.45, 1.55, .22, 48), MAT.cream, 0, 1.05, 0, g);
  mesh(new THREE.TorusGeometry(1.5, .04, 6, 64), MAT.gold, 0, 1.17, 0, g).rotation.x = Math.PI / 2;
  const cR = r + .25, colList = [], banners = [];
  for (let i = 0; i <= 14; i++){ const a = gap / 2 + i / 14 * (Math.PI * 2 - gap); colList.push({ p:[Math.sin(a) * cR, y + .95, Math.cos(a) * cR], s:[1, 1.05, 1] }); if (i % 2 === 1) banners.push(a); }
  g.add(inst(G.column, MAT.amethyst, colList));
  const top = y + .95 + 2.02;
  mesh(new THREE.CylinderGeometry(cR + .3, cR + .3, .3, 72, 1, true, gap / 2, Math.PI * 2 - gap), MAT.marbleV, 0, top, 0, g).material.side = THREE.DoubleSide;
  mesh(new THREE.CylinderGeometry(cR + .32, cR + .32, .05, 72, 1, true, gap / 2, Math.PI * 2 - gap), MAT.gold, 0, top + .17, 0, g);
  mesh(new THREE.CylinderGeometry(cR + .32, cR + .32, .05, 72, 1, true, gap / 2, Math.PI * 2 - gap), MAT.gold, 0, top - .17, 0, g);
  const bTex = [['#7040c8', '#f4ce87'], ['#ff9bcb', '#fff5e9'], ['#79e8ec', '#482080']].map(([a, b]) => ctex(64, 192, (c, w, h) => { c.fillStyle = a; c.fillRect(0, 0, w, h); c.fillStyle = b; c.fillRect(0, 0, w, 10); c.beginPath(); c.arc(w / 2, h * .42, 15, 0, 7); c.fill(); c.fillStyle = a; c.beginPath(); c.arc(w / 2 - 5, h * .4, 3.5, 0, 7); c.arc(w / 2 + 5, h * .4, 3.5, 0, 7); c.fill(); c.fillStyle = b; c.beginPath(); c.moveTo(0, h - 30); c.lineTo(w / 2, h); c.lineTo(w, h - 30); c.lineTo(w, h); c.lineTo(0, h); c.fill(); }));
  banners.forEach((a, i) => { const bm = sway(new THREE.MeshStandardMaterial({ map: bTex[i % 3], side: THREE.DoubleSide, roughness: .7, alphaTest: .5 }), .06, false);
    const b = mesh(new THREE.PlaneGeometry(.5, 1.5, 1, 8), bm, Math.sin(a) * (cR + .36), top - .95, Math.cos(a) * (cR + .36), g); b.rotation.y = a; b.castShadow = false; });
  /* two debaters and a spark between them */
  const d1 = makeChog('#ffad91', { scale: .32, frown: true }), d2 = makeChog('#f4ce87', { scale: .32 });
  d1.position.set(-.55, 1.16, 0); d1.rotation.y = Math.PI / 2; d2.position.set(.55, 1.16, 0); d2.rotation.y = -Math.PI / 2; g.add(d1); g.add(d2);
  const spot = new THREE.SpotLight(new THREE.Color('#ffd6f0'), 3, 14, .45, .6, 1.5); spot.position.set(0, 7, 3); spot.target = stage; g.add(spot);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1.6, 6, 32, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd6f0'), transparent: true, opacity: .06, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.position.set(0, 4.2, 1.3); beam.rotation.x = -.42; g.add(beam);
  L.arena.spin.push(t => { d1.position.y = 1.16 + Math.abs(Math.sin(t * 3)) * .14; d2.position.y = 1.16 + Math.abs(Math.sin(t * 3 + 1.7)) * .14; d1.rotation.z = Math.sin(t * 6) * .08; });
  /* audience */
  for (let i = 0; i < (mobile ? 6 : 14); i++){ const a = gap / 2 + .2 + rnd() * (Math.PI * 2 - gap - .4), ti = Math.floor(rr(1, 6)); const rr2 = 1.7 + ti * .32 + .14; const c = sitChog(Math.sin(a) * rr2, .95 + ti * .26, Math.cos(a) * rr2, a + Math.PI, .17); c.parent.remove(c); g.add(c); sitters.push(c); }
  [-1, 1].forEach(s => { const pole = mesh(new THREE.CylinderGeometry(.04, .05, 2.2, 8), MAT.gold, s * 1.25, 2.05, 4.0, g); mesh(G.ball, MAT.lampGlass, s * 1.25, 3.2, 4.0, g).scale.setScalar(.15); });
})();

/* ---------- 3. The Grand Gazette tower ---------- */
(function(){
  const g = L.feed.group, win = L.feed.win;
  mesh(G.cyl8, MAT.cream, 0, .15, 0, g).scale.set(2.4, .3, 2.4);
  mesh(G.cyl8, MAT.stone, 0, .38, 0, g).scale.set(2.1, .2, 2.1);
  const levels = [[1.45, 2.6, MAT.marble], [1.2, 2.2, MAT.marbleV], [.98, 1.7, MAT.marble]];
  let y = .48; const wins = [];
  levels.forEach(([r, h, m], li) => {
    const sec = mesh(new THREE.CylinderGeometry(r, r * 1.04, h, 8), m, 0, y + h / 2, 0, g); sec.rotation.y = Math.PI / 8;
    const fr = r * Math.cos(Math.PI / 8) * 1.02;
    for (let f = 0; f < 8; f++){ const a = f / 8 * Math.PI * 2; for (let k = 0; k < (li === 2 ? 1 : 2); k++){ wins.push({ p:[Math.sin(a) * fr, y + .35 + k * (h * .45), Math.cos(a) * fr], r:[0, a, 0], s: li === 2 ? .8 : 1 }); } }
    y += h;
    mesh(new THREE.TorusGeometry(r * 1.06, .05, 6, 8), MAT.gold, 0, y - .02, 0, g).rotation.set(Math.PI / 2, 0, Math.PI / 8);
    if (li < 2){ mesh(G.cyl8, MAT.cream, 0, y + .05, 0, g).scale.set(r + .45, .14, r + .45);
      const rail = mesh(new THREE.TorusGeometry(r + .4, .025, 6, 8), MAT.gold, 0, y + .42, 0, g); rail.rotation.set(Math.PI / 2, 0, Math.PI / 8);
      const bal = []; for (let i = 0; i < 24; i++){ const a = i / 24 * Math.PI * 2; bal.push({ p:[Math.sin(a) * (r + .38), y + .26, Math.cos(a) * (r + .38)], s:[.03, .3, .03] }); } g.add(inst(G.cyl, MAT.gold, bal, false));
      y += .12; }
  });
  g.add(inst(G.arch, win, wins, false));
  /* clock faces */
  const clockTex = ctex(256, 256, (c, w) => { const m = w / 2; c.fillStyle = '#fff5e9'; c.beginPath(); c.arc(m, m, m - 4, 0, 7); c.fill(); c.strokeStyle = '#c99a52'; c.lineWidth = 10; c.stroke();
    c.fillStyle = '#482080'; for (let i = 0; i < 12; i++){ const a = i / 12 * Math.PI * 2; c.save(); c.translate(m, m); c.rotate(a); c.fillRect(-3, -m + 18, 6, i % 3 ? 14 : 24); c.restore(); }
    c.font = '600 20px -apple-system, Helvetica, sans-serif'; c.textAlign = 'center'; c.fillText('GAZETTE', m, m + 52); });
  const faceMat = new THREE.MeshStandardMaterial({ map: clockTex, emissive: new THREE.Color('#fff1d6'), emissiveIntensity: .5, emissiveMap: clockTex, roughness: .4 });
  const hands = [];
  const cy = y - .95;
  for (let f = 0; f < 4; f++){ const a = f / 4 * Math.PI * 2 + Math.PI / 8 * 0, fr = .98 * Math.cos(Math.PI / 8) + .03;
    const holder = new THREE.Group(); holder.rotation.y = a + Math.PI / 8; g.add(holder);
    const face = mesh(new THREE.CircleGeometry(.36, 32), faceMat, 0, cy, fr + .02, holder); face.castShadow = false;
    mesh(new THREE.TorusGeometry(.37, .03, 6, 32), MAT.gold, 0, cy, fr + .02, holder);
    const hh = mesh(G.box, MAT.dark, 0, cy, fr + .04, holder); hh.scale.set(.025, .2, .01); hh.geometry = hh.geometry.clone().translate(0, .5, 0);
    const mh = mesh(G.box, MAT.dark, 0, cy, fr + .045, holder); mh.scale.set(.018, .3, .01); mh.geometry = mh.geometry.clone().translate(0, .5, 0); hands.push([hh, mh]); }
  /* onion dome and spire */
  mesh(G.cyl8, MAT.amethyst, 0, y + .15, 0, g).scale.set(1.0, .3, 1.0);
  const dome = mesh(G.onion, MAT.roseMetal, 0, y + .3, 0, g); dome.scale.set(.85, .95, .85);
  mesh(G.finial, MAT.gold, 0, y + .3 + 1.78, 0, g).scale.setScalar(1.2);
  L.feed.top = y + 3;
  /* floating newspapers */
  const paperTex = ctex(256, 180, (c, w, h) => { c.fillStyle = '#fff5e9'; c.fillRect(0, 0, w, h); c.fillStyle = '#482080'; c.font = '700 22px Georgia, serif'; c.textAlign = 'center'; c.fillText('THE CHOGTOWN', w / 2, 30); c.fillText('GAZETTE', w / 2, 54); c.fillRect(14, 62, w - 28, 3);
    c.fillStyle = '#bca2f4'; c.fillRect(14, 74, 96, 80); c.fillStyle = 'rgba(72,32,128,.55)'; for (let i = 0; i < 7; i++) c.fillRect(122, 76 + i * 11, w - 136 - (i % 3) * 18, 5); });
  const pm = new THREE.MeshStandardMaterial({ map: paperTex, side: THREE.DoubleSide, roughness: .8, emissive: new THREE.Color('#fff5e9'), emissiveIntensity: .25, emissiveMap: paperTex });
  const papers = []; for (let i = 0; i < 7; i++){ const p = mesh(new THREE.PlaneGeometry(.62, .44, 4, 1), pm, 0, 0, 0, g); p.castShadow = false; p.userData = { a: i / 7 * Math.PI * 2, h: 3.2 + (i % 3) * 1.6, r: 2.3 + (i % 2) * .5 }; papers.push(p); }
  /* side annex with a violet roof */
  const ann = new THREE.Group(); ann.position.set(-1.9, 0, 1.2); ann.rotation.y = .5; g.add(ann);
  mesh(G.box, MAT.marble, 0, .9, 0, ann).scale.set(1.6, 1.4, 1.3);
  const roof = mesh(new THREE.CylinderGeometry(0, 1.15, .8, 4, 1), MAT.roofV, 0, 2.0, 0, ann); roof.rotation.y = Math.PI / 4; roof.scale.set(1.15, 1, .92);
  g.add(inst(G.arch, win, [[-.45, .6], [.45, .6]].map(([x, yy]) => ({ p:[ann.position.x + Math.cos(.5) * x + Math.sin(.5) * .66, yy, ann.position.z - Math.sin(.5) * x + Math.cos(.5) * .66], r:[0, .5, 0], s: 1.1 })), false));
  L.feed.spin.push(t => {
    papers.forEach((p, i) => { const a = p.userData.a + t * .25; p.position.set(Math.sin(a) * p.userData.r, p.userData.h + Math.sin(t * 1.3 + i) * .25, Math.cos(a) * p.userData.r); p.rotation.set(Math.sin(t + i) * .3, a + Math.PI / 2, Math.sin(t * 1.7 + i) * .25); });
    const mins = 19 * 60 + 40 + t / 4; hands.forEach(([h, m]) => { h.rotation.z = -(mins / 720) * Math.PI * 2; m.rotation.z = -(mins % 60) / 60 * Math.PI * 2; });
  });
})();

/* ---------- 4. Palace of Legends (faces east toward the plaza) ---------- */
(function(){
  const g0 = L.hall.group, g = new THREE.Group(); g.rotation.y = Math.atan2(-P.hall.x, -P.hall.z); g0.add(g);
  const win = L.hall.win;
  mesh(G.box, MAT.stone, 0, .35, -.3, g).scale.set(7.2, .7, 5.0);
  mesh(G.box, MAT.gold, 0, .72, -.3, g).scale.set(7.25, .04, 5.05);
  for (let i = 0; i < 5; i++) mesh(G.box, MAT.cream, 0, .07 + i * .14, 2.35 + (4 - i) * .2, g).scale.set(2.6, .14, .2 + (4 - i) * 0 + .2);
  /* main hall */
  mesh(G.box, MAT.marble, 0, 2.0, -.8, g).scale.set(4.4, 2.6, 2.8);
  mesh(G.box, MAT.gold, 0, 3.33, -.8, g).scale.set(4.5, .06, 2.9);
  mesh(G.box, MAT.amethyst, 0, 3.5, -.8, g).scale.set(4.4, .3, 2.8);
  /* portico */
  const cols = []; for (let i = 0; i < 6; i++) cols.push({ p:[-1.75 + i * .7, .74, 1.15], s:[.95, 1.32, .95] });
  g.add(inst(G.column, MAT.marble, cols));
  mesh(G.box, MAT.cream, 0, 3.38, .9, g).scale.set(4.6, .3, .9);
  mesh(G.box, MAT.gold, 0, 3.22, 1.36, g).scale.set(4.6, .05, .04);
  const tri = new THREE.Shape(); tri.moveTo(-2.35, 0); tri.lineTo(2.35, 0); tri.lineTo(0, .95); tri.lineTo(-2.35, 0);
  const ped = mesh(new THREE.ExtrudeGeometry(tri, { depth: .9, bevelEnabled: false }), MAT.cream, 0, 3.53, .45, g);
  const pedTrim = mesh(new THREE.ExtrudeGeometry(tri, { depth: .04, bevelEnabled: false }), MAT.gold, 0, 3.53, 1.36, g); pedTrim.scale.set(.82, .7, 1); pedTrim.position.y = 3.6;
  /* drum, dome, ribs, lantern */
  mesh(new THREE.CylinderGeometry(1.15, 1.2, .9, 32), MAT.marble, 0, 4.1, -1.0, g);
  const ws = []; for (let i = 0; i < 12; i++){ const a = i / 12 * Math.PI * 2; ws.push({ p:[Math.sin(a) * 1.17, 3.84, -1.0 + Math.cos(a) * 1.17], r:[0, a, 0], s: .7 }); }
  mesh(new THREE.TorusGeometry(1.2, .05, 6, 48), MAT.gold, 0, 4.56, -1.0, g).rotation.x = Math.PI / 2;
  const dome = mesh(G.dome, MAT.amethyst, 0, 4.55, -1.0, g); dome.scale.set(1.12, 1.25, 1.12);
  for (let i = 0; i < 8; i++){ const rib = mesh(new THREE.TorusGeometry(1.0, .028, 6, 24, Math.PI / 2), MAT.gold, 0, 4.55, -1.0, g); rib.scale.set(1.13, 1.26, 1.13); rib.rotation.y = i / 8 * Math.PI * 2; }
  mesh(new THREE.CylinderGeometry(.25, .28, .4, 12), MAT.marble, 0, 5.95, -1.0, g);
  mesh(G.dome, MAT.gold, 0, 6.15, -1.0, g).scale.setScalar(.3);
  mesh(G.finial, MAT.gold, 0, 6.4, -1.0, g);
  /* wings with rose domes */
  [-1, 1].forEach(s => {
    mesh(G.box, MAT.marbleV, s * 2.75, 1.55, -.8, g).scale.set(1.4, 1.7, 2.3);
    mesh(G.box, MAT.gold, s * 2.75, 2.42, -.8, g).scale.set(1.45, .05, 2.35);
    mesh(new THREE.CylinderGeometry(.48, .5, .4, 24), MAT.cream, s * 2.75, 2.62, -.8, g);
    const d = mesh(G.onion, MAT.roseMetal, s * 2.75, 2.82, -.8, g); d.scale.set(.42, .45, .42);
    mesh(G.finial, MAT.gold, s * 2.75, 3.66, -.8, g).scale.setScalar(.7);
    ws.push({ p:[s * 2.75, 1.3, .36], s: 1.3 }, { p:[s * 2.45, 1.3, .36], s: 0 });
    /* glowing purple arch beside the steps */
    const ar = new THREE.Mesh(new THREE.TorusGeometry(.62, .06, 10, 32, Math.PI), new THREE.MeshStandardMaterial({ color: '#bca2f4', emissive: new THREE.Color('#9b6ef0'), emissiveIntensity: 2.4 }));
    ar.position.set(s * 2.2, 1.4, 2.4); g.add(ar);
    mesh(G.cyl, MAT.marble, s * 2.2 - .62, 1.07, 2.4, g).scale.set(.07, .7, .07); mesh(G.cyl, MAT.marble, s * 2.2 + .62, 1.07, 2.4, g).scale.set(.07, .7, .07);
  });
  for (let i = 0; i < 5; i++) ws.push({ p:[-1.4 + i * .7, 2.1, .62], s: 1.05 });
  g.add(inst(G.arch, win, ws.filter(w => w.s), false));
  mesh(G.archBig, win, 0, .74, .63, g).scale.set(1.3, 1.25, 1);
  /* golden statues and a giant trophy */
  const goldChog = new THREE.MeshStandardMaterial({ color: '#f4ce87', metalness: 1, roughness: .22, envMapIntensity:0.52 });
  [-1, 1].forEach(s => { mesh(G.box, MAT.marble, s * 3.1, 1.05, 2.0, g).scale.set(.6, .7, .6); const st = makeChog('#f4ce87', { scale: .4, gold: true, mat: goldChog, bellyMat: goldChog }); st.position.set(s * 3.1, 1.4, 2.0); st.rotation.y = -s * .3; g.add(st); });
  const trophy = mesh(lathe([[0,0],[.3,0],[.3,.08],[.12,.14],[.08,.4],[.12,.46],[.42,.62],[.46,1.1],[.42,1.14],[0,1.14]], 32), goldChog, 0, 3.6, -.8, g);
  trophy.position.set(0, 7.0, -1.0); trophy.scale.setScalar(.0);
  L.hall.spin.push(t => {});
})();

/* ---------- 5. Boutique Quarter (shopfronts face the plaza) ---------- */
(function(){
  const g0 = L.shop.group, g = new THREE.Group(); g.rotation.y = Math.atan2(-P.shop.x, -P.shop.z); g0.add(g);
  const win = L.shop.win;
  mesh(G.box, MAT.cream, 0, .08, -.4, g).scale.set(6.8, .16, 4.2);
  const shops = [ { x:-2.1, w:1.95, h:2.6, wall:'#ff9bcb', roof: MAT.roofV, awn:['#fff5e9', '#ff9bcb'] }, { x:0, w:2.2, h:3.3, wall:'#bca2f4', roof: MAT.roofR, awn:['#fff5e9', '#7040c8'], dome:true }, { x:2.15, w:1.95, h:2.8, wall:'#a4e8c4', roof: MAT.roofC, awn:['#fff5e9', '#79e8ec'] } ];
  const dispTex = (accent) => ctex(256, 160, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fff1d9'); gr.addColorStop(1, '#ffc58f'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.fillStyle = accent; c.beginPath(); c.moveTo(48, 130); c.lineTo(62, 60); c.lineTo(76, 130); c.fill(); c.beginPath(); c.arc(62, 50, 12, 0, 7); c.fill();
    c.beginPath(); c.moveTo(118, 130); c.quadraticCurveTo(128, 70, 140, 66); c.quadraticCurveTo(152, 70, 162, 130); c.fill(); c.beginPath(); c.arc(140, 52, 12, 0, 7); c.fill();
    c.fillRect(196, 104, 34, 26); c.strokeStyle = accent; c.lineWidth = 4; c.beginPath(); c.arc(213, 104, 11, Math.PI, 0); c.stroke(); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(0, 0, w, 6); });
  shops.forEach((s, i) => {
    const wall = new THREE.MeshStandardMaterial({ color: new THREE.Color(s.wall), roughness: .55, envMapIntensity:0.24 });
    mesh(G.box, wall, s.x, .16 + s.h / 2, -.9, g).scale.set(s.w, s.h, 2.0);
    mesh(G.box, MAT.cream, s.x, .16 + s.h, -.9, g).scale.set(s.w + .12, .14, 2.12);
    mesh(G.box, MAT.gold, s.x, .16 + s.h - .1, .12, g).scale.set(s.w + .02, .04, .04);
    const roof = mesh(new THREE.CylinderGeometry(0, 1, 1, 4, 1), s.roof, s.x, .16 + s.h + .5, -.9, g); roof.rotation.y = Math.PI / 4; roof.scale.set(s.w * .78, 1.0, 1.55);
    if (s.dome){ mesh(new THREE.CylinderGeometry(.34, .36, .3, 20), MAT.cream, s.x, .16 + s.h + 1.05, -.9, g); const d = mesh(G.onion, MAT.gold, s.x, .16 + s.h + 1.2, -.9, g); d.scale.set(.3, .32, .3); }
    /* display window and door */
    const dm = new THREE.MeshStandardMaterial({ map: dispTex(s.wall === '#a4e8c4' ? '#2f7a63' : '#482080'), emissive: new THREE.Color('#ffffff'), emissiveMap: null, emissiveIntensity: 0, roughness: .15, metalness: .1 });
    dm.emissiveMap = dm.map; dm.emissiveIntensity = 1.2; L.shop.displays = (L.shop.displays || []).concat(dm);
    const dw = mesh(new THREE.PlaneGeometry(s.w * .62, 1.05), dm, s.x - s.w * .12, .95, .11, g); dw.castShadow = false;
    mesh(G.box, MAT.gold, s.x - s.w * .12, .95, .1, g).scale.set(s.w * .62 + .08, 1.13, .03);
    mesh(G.archBig, win, s.x + s.w * .33, .2, .11, g).scale.set(.55, .75, 1);
    /* upper windows */
    g.add(inst(G.arch, win, [-.45, .45].map(o => ({ p:[s.x + o * s.w * .6, .16 + s.h - 1.0, .11], s: .95 })), false));
    /* striped awning */
    const aw = mesh(new THREE.PlaneGeometry(s.w * .95, .7), new THREE.MeshStandardMaterial({ map: stripeTex(s.awn[0], s.awn[1], 10), side: THREE.DoubleSide, roughness: .6 }), s.x, 1.72, .38, g); aw.rotation.x = -.95;
    mesh(new THREE.CylinderGeometry(.03, .03, s.w * .95, 6), MAT.gold, s.x, 1.48, .66, g).rotation.z = Math.PI / 2;
    /* hanging sign */
    mesh(G.box, MAT.gold, s.x + s.w * .5 + .02, 2.0, .3, g).scale.set(.05, .05, .4);
    mesh(new THREE.CircleGeometry(.17, 20), MAT.gold, s.x + s.w * .5 + .02, 1.8, .45, g).rotation.y = Math.PI / 2;
    /* planters with topiary */
    [-1, 1].forEach(o => { const px = s.x + o * (s.w / 2 - .18); mesh(G.box, MAT.cream, px, .32, .55, g).scale.set(.3, .32, .3); mesh(G.ball, MAT.hedge, px, .7, .55, g).scale.setScalar(.24); });
  });
  /* rotating hat on a pedestal in front */
  mesh(lathe([[0,0],[.5,0],[.5,.1],[.34,.16],[.3,.7],[.4,.78],[.4,.84],[0,.84]], 32), MAT.marble, 0, .16, 1.9, g);
  const hat = new THREE.Group(); hat.position.set(0, 1.45, 1.9); g.add(hat);
  mesh(new THREE.ConeGeometry(.28, .7, 32), MAT.roseMetal, 0, 0, 0, hat); mesh(G.ball, MAT.gold, 0, .38, 0, hat).scale.setScalar(.08); mesh(new THREE.TorusGeometry(.26, .035, 8, 32), MAT.gold, 0, -.32, 0, hat).rotation.x = Math.PI / 2;
  const pl = new THREE.PointLight(new THREE.Color('#ff9bcb'), 1.6, 7, 2); pl.position.set(0, 2.2, 1.5); g.add(pl);
  for (let i = 0; i < 3; i++) sitters.push((() => { const c = sitChog(-1.6 + i * 1.6, .16, 1.2 + (i % 2) * .4, Math.PI + rr(-.4, .4), .2); c.parent.remove(c); g.add(c); return c; })());
  L.shop.spin.push(t => { hat.rotation.y = t * .8; hat.position.y = 1.45 + Math.sin(t * 1.6) * .08; });
  /* lantern string across the shopfronts */
  const a = new THREE.Vector3(-3.0, 2.4, .7).applyMatrix4(new THREE.Matrix4().makeRotationY(g.rotation.y)).add(g0.position);
  const b = new THREE.Vector3(3.0, 2.4, .7).applyMatrix4(new THREE.Matrix4().makeRotationY(g.rotation.y)).add(g0.position);
  bulbs.push(...lanternString(a, b, .5, 16));
})();

/* ---------- Café terrace and flower market ---------- */
(function(){
  const E = extra[0], g = new THREE.Group(); g.position.set(E.x, 0, E.z); world.add(g);
  mesh(new THREE.CylinderGeometry(2.7, 2.7, .1, 48), MAT.cream, 0, .05, 0, g);
  mesh(new THREE.TorusGeometry(2.7, .04, 6, 64), MAT.gold, 0, .1, 0, g).rotation.x = Math.PI / 2;
  const kiosk = new THREE.Group(); kiosk.position.set(-.9, 0, -1.0); g.add(kiosk);
  mesh(new THREE.CylinderGeometry(.85, .9, 1.6, 20), MAT.lilac, 0, .9, 0, kiosk);
  mesh(new THREE.CylinderGeometry(1.15, .95, .14, 20), MAT.cream, 0, 1.76, 0, kiosk);
  const roof = mesh(new THREE.ConeGeometry(1.2, .9, 20), new THREE.MeshStandardMaterial({ map: stripeTex('#ff9bcb', '#fff5e9', 20), roughness: .55 }), 0, 2.28, 0, kiosk);
  mesh(G.finial, MAT.gold, 0, 2.7, 0, kiosk).scale.setScalar(.6);
  const kw = windowMat(); kiosk.add(inst(G.arch, kw, [0, 1, 2].map(i => { const a = -.6 + i * .6 + Math.PI * .25; return { p:[Math.sin(a) * .91, .55, Math.cos(a) * .91], r:[0, a, 0], s: 1.2 }; }), false));
  const umb = new THREE.MeshStandardMaterial({ map: stripeTex('#7040c8', '#fff5e9', 16), roughness: .6, side: THREE.DoubleSide });
  [[.9, .6], [-.2, 1.4], [1.3, -.6]].forEach(([x, z], i) => {
    mesh(G.cyl, MAT.gold, x, .45, z, g).scale.set(.04, .9, .04);
    mesh(G.cyl, MAT.cream, x, .62, z, g).scale.set(.32, .04, .32);
    mesh(G.cyl, MAT.gold, x, 1.15, z, g).scale.set(.02, 1.1, .02);
    mesh(new THREE.ConeGeometry(.8, .35, 16, 1, true), umb, x, 1.75, z, g);
    [0, Math.PI].forEach((a, k) => { const sx = x + Math.sin(a + i) * .55, sz = z + Math.cos(a + i) * .55; mesh(G.cyl, MAT.rose, sx, .3, sz, g).scale.set(.16, .05, .16); const c = sitChog(E.x + sx, .33, E.z + sz, a + i + Math.PI, .2); sitters.push(c); });
  });
  /* flower carts */
  const fl = [];
  [[1.6, -1.6, -.6], [-2.0, .6, .9]].forEach(([x, z, r]) => {
    const cart = new THREE.Group(); cart.position.set(x, 0, z); cart.rotation.y = r; g.add(cart);
    mesh(G.box, new THREE.MeshStandardMaterial({ color: '#8955d8', roughness: .5 }), 0, .55, 0, cart).scale.set(1.1, .4, .6);
    [-1, 1].forEach(s => mesh(new THREE.TorusGeometry(.18, .04, 6, 16), MAT.gold, s * .4, .2, .32, cart));
    [-1, 1].forEach(s => { mesh(G.cyl, MAT.gold, s * .5, 1.05, -.25, cart).scale.set(.02, 1.0, .02); });
    const can = mesh(new THREE.PlaneGeometry(1.25, .75), new THREE.MeshStandardMaterial({ map: stripeTex('#a4e8c4', '#fff5e9', 10), side: THREE.DoubleSide }), 0, 1.5, 0, cart); can.rotation.x = -1.2;
    for (let i = 0; i < 70 * Q; i++){ const lp = new THREE.Vector3(rr(-.5, .5), .8 + rr(0, .12), rr(-.25, .25)).applyEuler(cart.rotation).add(cart.position).add(g.position); fl.push({ p:[lp.x, lp.y, lp.z], s: rr(1, 1.8), c: pickOne(['#ff9bcb', '#f4ce87', '#79e8ec', '#fff5e9', '#ffad91']) }); }
  });
  world.add(inst(G.flower, fm, fl, false));
  bulbs.push(...lanternString(new THREE.Vector3(E.x - 2.4, 2.2, E.z + .2), new THREE.Vector3(E.x + 2.2, 2.2, E.z - 1.0), .45, 12));
})();

/* ---------- viewing terrace at the front edge ---------- */
(function(){
  const E = extra[1], g = new THREE.Group(); g.position.set(E.x, 0, E.z); world.add(g);
  mesh(new THREE.CylinderGeometry(1.7, 1.7, .12, 40, 1, false, -Math.PI / 2, Math.PI), MAT.cream, 0, .06, .2, g);
  const bal = []; for (let i = 0; i <= 18; i++){ const a = -Math.PI / 2 + i / 18 * Math.PI; bal.push({ p:[Math.sin(a) * 1.62, .32, .2 + Math.cos(a) * 1.62], s:[.05, .38, .05] }); }
  g.add(inst(G.cyl, MAT.marble, bal));
  const rail = mesh(new THREE.TorusGeometry(1.62, .05, 6, 40, Math.PI), MAT.gold, 0, .54, .2, g); rail.rotation.x = Math.PI / 2; rail.rotation.z = Math.PI;
  sitters.push(sitChog(E.x - .5, .12, E.z + .9, 0, .22), sitChog(E.x + .4, .12, E.z + 1.0, .2, .2));
})();
world.add(inst(G.ball, MAT.lampGlass, bulbs.map(b => ({ p: b.p, s: b.s })), false));
(function(){ const m = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: new THREE.Color('#ffffff'), emissiveIntensity: 2.2 }); world.add(inst(G.ball, m, bulbs, false)); })();

/* ---------- distant islets ---------- */
[[-48, 6, -62, 1.8], [62, -2, -50, 1.5], [-70, -4, 10, 1.6], [70, 8, 12, 1.2]].forEach(([x, y, z, s]) => {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); scene.add(g);
  mesh(new THREE.CylinderGeometry(3.2, 3.0, .5, 24), new THREE.MeshStandardMaterial({ color: '#8b62d6', roughness: .9 }), 0, 0, 0, g);
  const c = mesh(new THREE.ConeGeometry(3.0, 5.5, 24), new THREE.MeshStandardMaterial({ color: '#4b2a8f', roughness: 1, flatShading: true }), 0, -3, 0, g); c.rotation.x = Math.PI;
  mesh(new THREE.CylinderGeometry(.5, .55, 2.4, 12), MAT.marble, .4, 1.4, 0, g); const d = mesh(G.onion, MAT.roseMetal, .4, 2.6, 0, g); d.scale.setScalar(.45);
  mesh(G.blob, new THREE.MeshStandardMaterial({ color: '#bca2f4', roughness: .8 }), -1.3, .9, .6, g).scale.setScalar(.8);
  g.userData.bob = rnd() * 6; clouds.push(g);
});

/* ---------- post-processing ---------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .5, .55, 1.6);
composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, exposure: { value: .84 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float exposure; varying vec2 vUv;
    vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
    vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb * exposure; c = aces(c); c = srgb(c);
      float d = distance(vUv, vec2(.5)); c *= mix(1., .82, smoothstep(.5, .95, d)); c = mix(c, c * vec3(1.02, .98, 1.04), .5); gl_FragColor = vec4(c, 1.); }`
});
composer.addPass(grade);

/* ---------- camera rig ---------- */
const home = () => ({ target: new THREE.Vector3(0, .6, .4), radius: (innerWidth / innerHeight < .9 ? 66 : 37), theta: .0, phi: .92 });
const rig = { target: new THREE.Vector3(0, 1, 0), radius: 70, theta: -.9, phi: .62 };
const want = Object.assign({}, home(), { radius: 58, phi: .7, theta: -.5 });
let shift = { x: 0, y: 0 }, wantShift = { x: 0, y: 0 }, active = null, entered = false;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
function snap(){ rig.target.copy(want.target); rig.radius = want.radius; rig.theta = want.theta; rig.phi = want.phi; shift = Object.assign({}, wantShift); }
function updateShift(){ if (!active){ wantShift = { x: 0, y: 0 }; return; } wantShift = innerWidth > 760 ? { x: Math.min(420, innerWidth * .33) / 2, y: 0 } : { x: 0, y: innerHeight * .25 }; }
function focus(key){
  const p = P[key]; active = key;
  want.target = new THREE.Vector3(p.x, key === 'feed' ? 3.2 : key === 'home' ? 2.6 : 1.4, p.z);
  want.radius = p.cam.r * (innerWidth / innerHeight < .9 ? 1.35 : 1); want.phi = p.cam.phi;
  want.theta = key === 'home' ? 0 : Math.atan2(-p.x, -p.z);
  updateShift(); if (reduce) snap();
}
function overview(){ active = null; const h = home(); want.target = h.target; want.radius = h.radius; want.phi = h.phi; want.theta = h.theta; wantShift = { x: 0, y: 0 }; if (reduce) snap(); }
const clampR = r => Math.min(80, Math.max(8, r)), clampPhi = p => Math.min(1.3, Math.max(.35, p));

/* pointer: drag to orbit, wheel or pinch to zoom, tap to visit */
const pointers = new Map(); let drag = null, pinch = null;
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2){ const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), r: want.radius }; drag = null; }
  else drag = { x: e.clientX, y: e.clientY, moved: 0, th: want.theta, ph: want.phi }; });
canvas.addEventListener('pointermove', e => {
  pointer.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); needPick = true;
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2){ const [a, b] = [...pointers.values()]; want.radius = clampR(pinch.r * pinch.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y))); if (reduce) snap(); return; }
  if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
  if (drag.moved > 6){ canvas.classList.add('dragging'); want.theta = drag.th - dx * .005; want.phi = clampPhi(drag.ph - dy * .004); if (reduce) snap(); }
});
function endPointer(e){ pointers.delete(e.pointerId); canvas.classList.remove('dragging');
  if (drag && drag.moved <= 6 && e.type === 'pointerup'){ pointer.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); const k = pick(); if (k) hooks.onOpen(k); }
  if (pointers.size < 2) pinch = null; drag = null; }
canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', e => { e.preventDefault(); want.radius = clampR(want.radius * (1 + e.deltaY * .0012)); if (reduce) snap(); }, { passive: false });

/* picking */
const ray = new THREE.Raycaster(), pointer = new THREE.Vector2(-9, -9); let needPick = false, hovered = null;
const proxies = Object.values(L).map(l => l.proxy);
function pick(){ ray.setFromCamera(pointer, camera); const h = ray.intersectObjects(proxies, false)[0]; return h ? h.object.userData.key : null; }
function setHover(k){ if (k === hovered) return; hovered = k; canvas.classList.toggle('hovering', !!k); Object.entries(labelEls).forEach(([key, el]) => el.classList.toggle('hot', key === k)); }

/* labels */
const labelEls = {};
places.forEach(p => {
  const b = document.createElement('button'); b.className = 'label glass'; b.innerHTML = `<i><img src="/toy/i-${p.key}.webp" alt=""></i><span class="t"><b>${p.name}</b><span>${p.blurb}</span></span>`;
  b.addEventListener('click', () => hooks.onOpen(p.key)); b.addEventListener('mouseenter', () => setHover(p.key)); b.addEventListener('mouseleave', () => setHover(null)); b.addEventListener('focus', () => setHover(p.key)); b.addEventListener('blur', () => setHover(null));
  labelsEl.appendChild(b); labelEls[p.key] = b;
});
const tmp = new THREE.Vector3();
function placeLabels(){
  places.forEach(p => { const el = labelEls[p.key]; const h = p.key === 'feed' ? (L.feed.top || 10) : p.label;
    tmp.set(p.x, h + L[p.key].lift, p.z).project(camera);
    const hide = !entered || tmp.z > 1 || Math.abs(tmp.x) > (innerWidth <= 760 ? .62 : .92) || Math.abs(tmp.y) > .95 || (active && (active !== p.key || innerWidth <= 760));
    el.classList.toggle('off', hide);
    if (!hide) el.style.transform = `translate(${(tmp.x * .5 + .5) * innerWidth}px, ${(-tmp.y * .5 + .5) * innerHeight}px) translate(-50%, -100%)`; });
}

/* ---------- shell hooks ---------- */
let bounceT = -9; function bounce(){ bounceT = clock.getElapsedTime(); }
function enter(){ if (entered) return; entered = true; overview(); }
/* ---------- loop ---------- */
const clock = new THREE.Clock();
function resize(){ const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); composer.setSize(w, h); bloom.resolution.set(w * (mobile ? .5 : 1), h * (mobile ? .5 : 1)); camera.aspect = w / h; camera.updateProjectionMatrix(); updateShift(); if (!active && entered) overview(); }
addEventListener('resize', resize); resize();
let disposed = false;
let running = true, frames = 0, perfT = 0, useBloom = true;
const onVis = () => { running = !document.hidden && !disposed; if (running){ clock.getDelta(); requestAnimationFrame(loop); } };
document.addEventListener('visibilitychange', onVis);
function loop(){
  if (!running || disposed) return;
  const dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime; uTime.value = reduce ? 0 : t;
  /* adaptive quality: drop resolution, then bloom, if frames are slow */
  if (frames < 150){ frames++; if (frames > 30) perfT += dt; if (frames === 150){ const avg = perfT / 120; if (avg > .03){ pr = 1; renderer.setPixelRatio(pr); composer.setPixelRatio && composer.setPixelRatio(pr); resize(); } if (avg > .045) useBloom = false; } }
  if (!entered && !reduce) want.theta += dt * .05;
  const ease = 1 - Math.pow(entered ? .03 : .25, dt);
  rig.target.lerp(want.target, ease); rig.radius += (want.radius - rig.radius) * ease; rig.theta += wrap(want.theta - rig.theta) * ease; rig.phi += (want.phi - rig.phi) * ease;
  const se = 1 - Math.pow(.02, dt); shift.x += (wantShift.x - shift.x) * se; shift.y += (wantShift.y - shift.y) * se;
  const sp = Math.sin(rig.phi);
  camera.position.set(rig.target.x + rig.radius * sp * Math.sin(rig.theta), rig.target.y + rig.radius * Math.cos(rig.phi), rig.target.z + rig.radius * sp * Math.cos(rig.theta));
  camera.lookAt(rig.target); camera.setViewOffset(innerWidth, innerHeight, shift.x, shift.y, innerWidth, innerHeight);

  if (!reduce){
    world.position.y = Math.sin(t * .4) * .12;
    clouds.forEach(c => { if (c.isSprite){ c.userData.a += c.userData.v * dt; c.position.x = Math.cos(c.userData.a) * c.userData.r; c.position.z = Math.sin(c.userData.a) * c.userData.r; } else c.position.y += Math.sin(t * .5 + c.userData.bob) * .006; });
    Object.values(L).forEach(l => l.spin.forEach(f => f(t)));
    const b = Math.max(0, 1 - (t - bounceT) / .6), hero = L.home.hero;
    hero.position.y = 2.77 + Math.sin(b * Math.PI) * .5; hero.rotation.y = Math.sin(t * .5) * .5; hero.scale.setScalar(.62 * (1 + Math.sin(b * Math.PI) * .08));
    walkers.forEach(w => {
      let p, dir;
      if (w.ring){ w.u += w.v * dt * .35; const a = w.u * Math.PI * 2; p = new THREE.Vector3(Math.sin(a) * w.ring, 0, Math.cos(a) * w.ring); dir = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)).multiplyScalar(Math.sign(w.v)); }
      else { w.u += w.v * dt; if (w.u > 1 || w.u < 0){ w.v *= -1; w.u = Math.min(1, Math.max(0, w.u)); } p = w.curve.getPointAt(w.u); const tg = w.curve.getTangentAt(w.u); p.x -= tg.z * w.lane; p.z += tg.x * w.lane; dir = tg.multiplyScalar(Math.sign(w.v)); }
      w.c.position.set(p.x, Math.abs(Math.sin(t * 7 + w.hop)) * .07, p.z); w.c.rotation.y = Math.atan2(dir.x, dir.z); w.c.rotation.z = Math.sin(t * 7 + w.hop) * .06;
    });
    sitters.forEach((c, i) => { c.rotation.z = Math.sin(t * 1.5 + i) * .04; });
  }
  if (needPick && !drag){ needPick = false; setHover(pick()); }
  Object.entries(L).forEach(([key, l]) => {
    const on = key === hovered || key === active;
    l.glow += ((on ? 1 : 0) - l.glow) * (1 - Math.pow(.004, dt));
    l.lift = l.glow * .12; l.group.position.y = l.lift;
    l.light.intensity = l.baseLight + l.glow * 2.6;
    l.win.emissiveIntensity = 1.7 + l.glow * 2.2;
    l.halo.material.opacity = l.glow * .55;
    if (l.displays) l.displays.forEach(d => d.emissiveIntensity = 1.2 + l.glow * 1.2);
  });
  if (useBloom) composer.render(); else { bloom.enabled = false; composer.render(); }
  placeLabels();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
requestAnimationFrame(loop);
return {
  focus, overview, enter, bounce,
  setLook(l){ look = { ...look, ...l }; setHat(look.hat); setAura(look.aura); },
  zoomIn(){ want.radius = clampR(want.radius * .8); if (reduce) snap(); },
  zoomOut(){ want.radius = clampR(want.radius * 1.25); if (reduce) snap(); },
  rotate(){ want.theta += Math.PI / 4; if (reduce) snap(); },
  refit(){ updateShift(); },
  dispose(){ disposed = true; running = false; removeEventListener('resize', resize); document.removeEventListener('visibilitychange', onVis); labelsEl.innerHTML = ''; renderer.dispose(); }
};
}
