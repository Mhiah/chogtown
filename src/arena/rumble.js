/* eslint-disable */
// @ts-nocheck
/*
 * Rumble: a ring-out brawler on the Royal Amphitheatre stage.
 * Two Chogs, three lives each. Every move comes from the Chog's traits (src/lib/kit.ts):
 * Eyes = attack, Mouth = special, Head = dash, Body / Aura / Accessory = passives.
 * Knock the other Chog off the stage. The more damage it has taken, the further it flies.
 */
import { sfx, unlock } from './sfx';

const R = 300;            // stage radius (world px)
const TILT = .6;          // perspective squash of the stage plane
const STOCKS = 3;
const MATCH_S = 120;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const len = (x, z) => Math.hypot(x, z) || 1e-6;
const rnd = (a, b) => a + Math.random() * (b - a); // cosmetic only
const mulberry = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const TICK = 1 / 60;

/* Opponent personalities, from the town's archetypes. range = preferred distance. */
const AI = {
  brawler:    { range: 70,  aggro: 1,   edge: .6, spc: .9, dash: .8, jitter: .1 },
  critic:     { range: 260, aggro: .5,  edge: .8, spc: .5, dash: .4, jitter: .05 },
  schemer:    { range: 150, aggro: .8,  edge: .9, spc: .7, dash: .9, jitter: .08, flank: true },
  dreamer:    { range: 180, aggro: .35, edge: .5, spc: .4, dash: .3, jitter: .5 },
  hype:       { range: 120, aggro: .95, edge: .5, spc: 1,  dash: 1,  jitter: .25 },
  sweetheart: { range: 200, aggro: .45, edge: .9, spc: .6, dash: .4, jitter: .1 },
  drama:      { range: 140, aggro: .7,  edge: .55, spc: .8, dash: .7, jitter: .35 },
  knowitall:  { range: 210, aggro: .7,  edge: 1,  spc: .7, dash: .6, jitter: .03 },
};

/**
 * seed: makes the fight deterministic (every random choice that matters comes from it), so a Main Event
 * plays out identically for every viewer and on the server. startAt (ms epoch): play in sync with the
 * wall clock from that moment, fast-forwarding if you join late. No canvas: headless, call run().
 * @param {{ canvas?: HTMLCanvasElement, me: any, foe: any, onEnd?: (r: any) => void, onEvent?: (e: any) => void, hard?: boolean, auto?: boolean, seed?: number, startAt?: number, spectate?: boolean }} o
 */
export function createRumble({ canvas, me, foe, onEnd, onEvent, hard = false, auto = false, seed = null, startAt = null, spectate = false }){
  const headless = !canvas;
  const G = seed != null ? mulberry(seed) : Math.random; // game randomness
  const rg = (a, b) => a + G() * (b - a);
  const later = []; // { at, f } things that happen a moment later, in game time
  const ctx = headless ? null : canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, S = 1, CX = 0, CY = 0;
  function resize(){
    if (headless) return;
    dpr = Math.min(devicePixelRatio || 1, 2); W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const narrow = W < 600;
    S = narrow ? Math.min(W * .96 / (R * 2), H / ((R * 2 * TILT) + 260)) : Math.min(W / (R * 2 + 140), H / ((R * 2 * TILT) + 300));
    CX = W / 2; CY = narrow ? H * .5 : H * .56;
  }
  resize(); if (!headless) addEventListener('resize', resize);

  const img = src => { if (headless) return { complete: false }; const i = new Image(); i.src = src; return i; };
  const mk = (who, side) => ({
    who, side, kit: who.kit, img: img(who.image), name: who.name,
    x: side ? 130 : -130, z: 0, vx: 0, vz: 0, y: 0, vy: 0,
    r: 34 * (.92 + who.kit.body.mass * .08), face: { x: side ? -1 : 1, z: 0 },
    dmg: 0, stocks: STOCKS, cd: { atk: 0, spc: 1.5, dash: 0 }, charges: who.kit.dash.kind === 'double' ? 2 : 1,
    state: 'ok', t: 0, stun: 0, slow: 0, burn: 0, burnTick: 0, charm: 0, freeze: 0, shield: 0, anchor: 0, invuln: 1.2,
    grin: 0, dashT: 0, dashDir: { x: 0, z: 0 }, dashHit: false, lunge: 0, puke: 0, pukeTick: 0, windup: 0,
    duck: who.kit.body.perk === 'duck', hover: who.kit.body.perk === 'astro', frog: who.kit.acc.kind === 'frog', regenT: 0,
    flash: 0, squash: 0, walk: 0, dealt: 0, ringouts: 0, combo: 0,
  });
  const P = [mk(me, 0), mk(foe, 1)];
  const brain = who => ({ A: AI[who.archetype] || AI.brawler, t: 0, input: { mx: 0, mz: 0, ax: -1, az: 0, atk: false, spc: false, dash: false }, strafe: G() < .5 ? 1 : -1 });
  const brains = [brain(me), brain(foe)];

  let shots = [], beams = [], puddles = [], waves = [], fx = [], texts = [], frogs = [];
  let time = 0, clock = MATCH_S, phase = 'intro', phaseT = 0, hitstop = 0, shake = 0, slowmo = 1, crowdHype = 0, over = false, result = null;
  const crowd = [];
  for (let row = 0; row < 3; row++) for (let i = 0; i < 26 + row * 6; i++) {
    const a = Math.PI * (1.06 + (i / (25 + row * 6)) * .88);
    crowd.push({ a, row, c: ['#8955d8', '#ff9bcb', '#79e8ec', '#f4ce87', '#a4e8c4', '#6a45c9'][Math.floor(Math.random() * 6)], ph: Math.random() * 6 });
  }

  /* ---------- input ---------- */
  const keys = new Set();
  const input = { mx: 0, mz: 0, ax: 1, az: 0, atk: false, spc: false, dash: false, mouse: false, stick: null };
  const kd = e => {
    const k = e.key.toLowerCase(); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    keys.add(k); unlock();
    if (k === 'j' || k === 'z') input.atk = true;
    if (k === 'k' || k === 'x' || k === 'e') input.spc = true;
    if (k === ' ' || k === 'shift' || k === 'l' || k === 'c') input.dash = true;
  };
  const ku = e => keys.delete(e.key.toLowerCase());
  if (!headless && !auto) { addEventListener('keydown', kd); addEventListener('keyup', ku); }
  const toWorld = (sx, sy) => ({ x: (sx - CX) / S, z: (sy - CY) / (S * TILT) });
  const mm = e => { const b = canvas.getBoundingClientRect(); const w = toWorld(e.clientX - b.left, e.clientY - b.top); const p = P[0]; const dx = w.x - p.x, dz = w.z - p.z, l = len(dx, dz); input.ax = dx / l; input.az = dz / l; input.mouse = true; };
  const md = e => { if (e.pointerType === 'touch') return; unlock(); mm(e); if (e.button === 2) input.spc = true; else input.atk = true; };
  const cm = e => e.preventDefault();
  if (!headless && !auto) { canvas.addEventListener('pointermove', mm); canvas.addEventListener('pointerdown', md); canvas.addEventListener('contextmenu', cm); }

  function readInput(){
    let mx = 0, mz = 0;
    if (keys.has('a') || keys.has('arrowleft')) mx--; if (keys.has('d') || keys.has('arrowright')) mx++;
    if (keys.has('w') || keys.has('arrowup')) mz--; if (keys.has('s') || keys.has('arrowdown')) mz++;
    if (input.stick) { mx = input.stick.x; mz = input.stick.y; }
    const l = Math.hypot(mx, mz);
    input.mx = l > 1 ? mx / l : mx; input.mz = l > 1 ? mz / l : mz;
    if (!input.mouse && l > .2) { input.ax = mx / l; input.az = mz / l; }
  }

  /* ---------- helpers ---------- */
  const other = p => P[1 - p.side];
  const say = (x, z, text, color = '#fff', big = false) => texts.push({ x: x + (big ? 0 : rnd(-34, 34)), z, text, color, big, t: 0 });
  const spark = (x, z, color, n = 10, sp = 260) => { for (let i = 0; i < n; i++){ const a = Math.random() * TAU, v = rnd(.3, 1) * sp; fx.push({ x, z, y: 10, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: rnd(80, 260), life: rnd(.35, .7), t: 0, color, size: rnd(3, 6) }); } };
  const mult = p => {
    let m = p.kit.power;
    if (p.grin > 0) m *= 1.6;
    const o = other(p);
    if (p.kit.acc.kind === 'pump' && p.stocks > o.stocks) m *= 1.25;
    if (p.kit.acc.kind === 'dump' && p.stocks < o.stocks) m *= 1.25;
    return m;
  };

  function hit(t, src, o){
    if (t.state !== 'ok' || t.invuln > 0) return false;
    if (t.dashT > 0 && t.kit.dash.kind === 'roll') return false;
    if (o.shot && t.kit.aura.kind === 'smoke' && G() < .22){ say(t.x, t.z, 'phased', '#d6d0e4'); return false; }
    if (t.shield > 0){ if (o.shot) return 'reflect'; spark(t.x, t.z, '#ff9bcb', 6); return false; }
    let dmg = o.dmg * mult(src), crit = false;
    if (src.kit.acc.kind === 'lucky' && G() < .12){ dmg *= 1.6; crit = true; onEvent?.({ type: 'crit', side: src.side }); }
    if (src.grin > 0 && o.dmg > 1){ src.grin = 0; say(src.x, src.z, 'GRIN POWER', '#f4ce87'); }
    t.dmg = Math.min(999, t.dmg + dmg); src.dealt += dmg; t.lastHit = `${o.kind || (o.shot ? 'shot' : 'melee')}:${o.kb}`;
    if (src.kit.aura.kind === 'leech') src.dmg = Math.max(0, src.dmg - dmg * .3);
    if (src.kit.aura.kind === 'burn' && o.dmg >= 2) t.burn = Math.max(t.burn, 1.5);
    if (o.burn) t.burn = Math.max(t.burn, o.burn);
    if (o.slow) t.slow = Math.max(t.slow, o.slow);
    if (o.stun) t.stun = Math.max(t.stun, o.stun);
    if (o.freeze) t.freeze = Math.max(t.freeze, o.freeze);
    if (o.charm) t.charm = Math.max(t.charm, o.charm);
    const anchor = t.anchor > 0 ? 3 : 1;
    const k = o.kb * (1 + t.dmg / 60) / (t.kit.body.mass * anchor) * 38;
    t.launch = Math.min(1.2, .25 + k / 900);
    const l = len(o.dx, o.dz);
    t.vx += o.dx / l * k; t.vz += o.dz / l * k;
    t.flash = .12; t.squash = 1;
    if (o.kb * (1 + t.dmg / 60) > 9){ hitstop = .07; shake = Math.min(18, shake + 9); sfx.big(); crowdHype = 1; onEvent?.({ type: 'smash', side: t.side, dmg: Math.round(t.dmg) }); }
    else { shake = Math.min(10, shake + 3); sfx.hit(1 + dmg / 10); }
    spark(t.x, t.z, o.color || '#fff', o.kb > 6 ? 16 : 8);
    say(t.x, t.z, `${crit ? 'CRIT ' : ''}${Math.round(dmg)}%`, crit ? '#ffe27a' : '#fff');
    src.combo++;
    return true;
  }

  /* ---------- abilities ---------- */
  function shoot(p, o){ shots.push({ owner: p.side, x: p.x + p.face.x * p.r, z: p.z + p.face.z * p.r, life: o.life ?? 1, t: 0, r: o.r ?? 8, ...o }); }
  function attack(p){
    const e = p.kit.eyes.kind, f = p.face, col = p.kit.eyes.color, o = other(p);
    const cd = { laser: .5, tears: .45, hearts: .55, bolts: .5, stare: .95, spit: .4 }[e];
    p.cd.atk = cd;
    if (p.kit.acc.kind === 'knife' && len(o.x - p.x, o.z - p.z) < 84){
      hit(o, p, { dmg: 5, kb: 5.5, dx: o.x - p.x, dz: o.z - p.z, color: '#e8e8f0' });
      fx.push({ slash: true, x: p.x + f.x * 40, z: p.z + f.z * 40, a: Math.atan2(f.z, f.x), t: 0, life: .18 });
    }
    if (e === 'laser'){ p.windup = .11; sfx.laser(); return; }
    const a = Math.atan2(f.z, f.x);
    const dir = (da, sp) => ({ vx: Math.cos(a + da) * sp, vz: Math.sin(a + da) * sp });
    if (e === 'tears'){ [-.26, 0, .26].forEach(d => shoot(p, { ...dir(d, 560), life: .45, dmg: 3, kb: 3.6, color: col, kind: 'tear' })); sfx.tears(); }
    if (e === 'hearts'){ shoot(p, { ...dir(0, 380), life: 1.6, dmg: 4, kb: 3, charm: .7, homing: 3.2, color: col, kind: 'heart', r: 11 }); sfx.heart(); }
    if (e === 'bolts'){ shoot(p, { ...dir(-.04, 760), life: .6, dmg: 3.5, kb: 3, color: col, kind: 'bolt' }); later.push({ at: time + .08, f: () => !over && p.state === 'ok' && shoot(p, { ...dir(.04, 760), life: .6, dmg: 3.5, kb: 3, color: col, kind: 'bolt' }) }); sfx.bolt(); }
    if (e === 'stare'){ shoot(p, { ...dir(0, 300), life: 1.4, dmg: 7, kb: 6, stun: .45, color: col, kind: 'stare', r: 17 }); sfx.stare(); }
    if (e === 'spit'){ shoot(p, { ...dir(0, 620), life: .7, dmg: 5, kb: 4.6, color: col, kind: 'spit' }); sfx.spit(); }
  }
  function fireLaser(p){
    const e = p.kit.eyes, o = other(p), f = p.face, pierce = e.color === '#b06bff';
    const L = pierce ? 480 : 380, x1 = p.x + f.x * p.r, z1 = p.z + f.z * p.r;
    beams.push({ x1, z1, x2: x1 + f.x * L, z2: z1 + f.z * L, color: e.color, t: 0, life: .16 });
    // ray vs circle
    const rx = o.x - x1, rz = o.z - z1, proj = rx * f.x + rz * f.z;
    if (proj > 0 && proj < L && Math.abs(rx * f.z - rz * f.x) < o.r + 6){
      const ex = { dmg: 6, kb: 7, dx: f.x, dz: f.z, color: e.color };
      if (e.color === '#ff7a2b') ex.burn = 2; if (e.color === '#5dff94') ex.slow = 1; if (e.color === '#59e6ff') ex.freeze = .35;
      hit(o, p, ex);
    }
  }
  function special(p){
    const m = p.kit.mouth.kind, f = p.face, o = other(p);
    p.cd.spc = 4.5 * (p.kit.aura.kind === 'focus' ? .78 : 1);
    if (m === 'puke'){ p.puke = .9; sfx.puke(); puddles.push({ kind: 'slick', x: p.x + f.x * 130, z: p.z + f.z * 130, r: 70, life: 6, t: 0 }); }
    if (m === 'bubble'){ p.shield = 2; sfx.bubble(); }
    if (m === 'drool'){ puddles.push({ kind: 'drool', x: p.x, z: p.z, r: 66, life: 6, t: 0, owner: p.side }); puddles.push({ kind: 'drool', x: p.x + f.x * 170, z: p.z + f.z * 170, r: 78, life: 6, t: 0, owner: p.side }); sfx.drool(); }
    if (m === 'coins'){ const a = Math.atan2(f.z, f.x); for (let i = -2; i <= 2; i++) shoot(p, { vx: Math.cos(a + i * .2) * 640, vz: Math.sin(a + i * .2) * 640, life: .55, dmg: 3, kb: 3.6, color: '#ffd45c', kind: 'coin', r: 9 }); sfx.coins(); }
    if (m === 'honk'){ waves.push({ x: p.x, z: p.z, r: 0, max: 170, t: 0, life: .35, color: '#ff6b8a' }); sfx.honk(); const d = len(o.x - p.x, o.z - p.z); if (d < 170 + o.r) hit(o, p, { dmg: 6, kb: 10, stun: .25, dx: o.x - p.x, dz: o.z - p.z, color: '#ff6b8a' }); }
    if (m === 'chomp'){ p.lunge = .18; p.dashDir = { ...f }; p.dashHit = false; sfx.chomp(); }
    if (m === 'wail'){
      waves.push({ x: p.x, z: p.z, r: 0, max: 260, t: 0, life: .45, color: '#9fd8ff', cone: Math.atan2(f.z, f.x) }); sfx.wail();
      const dx = o.x - p.x, dz = o.z - p.z, d = len(dx, dz);
      if (d < 260 && (dx * f.x + dz * f.z) / d > Math.cos(.55)) hit(o, p, { dmg: 4, kb: 8.5, dx, dz, color: '#9fd8ff' });
    }
    if (m === 'grin'){ p.dmg = Math.max(0, p.dmg - 20); p.grin = 3; say(p.x, p.z, '+heal', '#a4e8c4', true); sfx.grin(); }
  }
  function dash(p, dir){
    const k = p.kit.dash.kind;
    if (p.charges <= 0) return;
    p.charges--; if (p.charges <= 0) p.cd.dash = p.kit.body.perk === 'escape' ? .7 : 1.1;
    const l = len(dir.x, dir.z); p.dashDir = { x: dir.x / l, z: dir.z / l }; p.dashHit = false;
    p.dashT = { gore: .2, quick: .16, anchor: .12, slide: .32, double: .14, roll: .2 }[k];
    p.dashSp = { gore: 950, quick: 1050, anchor: 800, slide: 820, double: 1000, roll: 860 }[k];
    if (k === 'anchor') p.anchor = .9;
    if (p.kit.body.perk === 'banana') puddles.push({ kind: 'peel', x: p.x, z: p.z, r: 26, life: 7, t: 0, owner: p.side });
    sfx.dash();
  }

  /* ---------- AI ---------- */
  function think(side, dt){
    const ai = brains[side], A = ai.A, p = P[side], o = P[1 - side], I = ai.input;
    ai.t -= dt; I.atk = I.spc = I.dash = false;
    const dx = o.x - p.x, dz = o.z - p.z, d = len(dx, dz), myR = len(p.x, p.z), foeR = len(o.x, o.z);
    const err = (hard ? .05 : .16) + A.jitter * .2;
    const aimA = Math.atan2(dz + o.vz * .12, dx + o.vx * .12) + rg(-err, err);
    I.ax = Math.cos(aimA); I.az = Math.sin(aimA);
    if (ai.t > 0) return;
    ai.t = (hard ? .1 : .17) + G() * .1;
    let mx = 0, mz = 0;
    // keep to preferred range, strafe around
    const want = A.range * (o.dmg > 90 ? .6 : 1);
    const toward = d > want ? 1 : d < want * .6 ? -1 : 0;
    mx += dx / d * toward; mz += dz / d * toward;
    if (G() < .03) ai.strafe *= -1;
    mx += -dz / d * ai.strafe * .7; mz += dx / d * ai.strafe * .7;
    if (A.flank){ const bx = o.x - o.face.x * 90, bz = o.z - o.face.z * 90; mx += (bx - p.x) / 200; mz += (bz - p.z) / 200; }
    // stay away from the edge
    if (myR > R * (.62 + (1 - A.edge) * .2)){ mx -= p.x / myR * 1.6 * A.edge; mz -= p.z / myR * 1.6 * A.edge; }
    mx += rg(-1, 1) * A.jitter; mz += rg(-1, 1) * A.jitter;
    const l = Math.hypot(mx, mz) || 1; I.mx = mx / l; I.mz = mz / l;
    // attack when lined up and in range
    const e = p.kit.eyes.kind, range = { laser: 370, tears: 240, hearts: 520, bolts: 420, stare: 380, spit: 400 }[e];
    if (d < range && G() < .55 + A.aggro * .4) I.atk = true;
    // special
    const m = p.kit.mouth.kind, sr = { puke: 230, bubble: 999, drool: 240, coins: 360, honk: 150, chomp: 190, wail: 240, grin: 999 }[m];
    let useS = d < sr && G() < A.spc * .6;
    if (m === 'grin') useS = p.dmg > 55 && G() < .5;
    if (m === 'bubble') useS = shots.some(s => s.owner !== side && len(s.x - p.x, s.z - p.z) < 160) || (d < 110 && G() < .3);
    if (useS) I.spc = true;
    // dash: finish an opponent near the edge, or escape the edge
    if (foeR > R * .55 && d < 220 && G() < A.dash * .7) { I.dash = true; I.dashX = dx; I.dashZ = dz; }
    else if (myR > R * .85 && G() < .6) { I.dash = true; I.dashX = -p.x; I.dashZ = -p.z; }
    else if (d < 90 && G() < A.dash * .25) { I.dash = true; I.dashX = dx; I.dashZ = dz; }
  }

  /* ---------- step ---------- */
  function control(p, I, dt){
    if (p.state !== 'ok') return;
    const stopped = p.stun > 0 || p.freeze > 0;
    const l = len(I.ax, I.az);
    if (!stopped) { p.face.x += (I.ax / l - p.face.x) * Math.min(1, dt * 18); p.face.z += (I.az / l - p.face.z) * Math.min(1, dt * 18); const fl = len(p.face.x, p.face.z); p.face.x /= fl; p.face.z /= fl; }
    let mx = I.mx, mz = I.mz;
    if (p.charm > 0){ const o = other(p); const dx = o.x - p.x, dz = o.z - p.z, d = len(dx, dz); mx = dx / d; mz = dz / d; }
    let sp = 430 * p.kit.body.speed * (p.kit.aura.kind === 'wind' ? 1.08 : 1) * (p.slow > 0 ? .55 : 1);
    if (puddles.some(u => u.kind === 'drool' && u.owner !== p.side && len(u.x - p.x, u.z - p.z) < u.r)) sp *= .45;
    if (!stopped && p.dashT <= 0 && p.lunge <= 0 && !(p.launch > .15)){ p.vx += mx * sp * dt * 8; p.vz += mz * sp * dt * 8; }
    if (stopped) return;
    if (I.atk && p.cd.atk <= 0 && p.windup <= 0) attack(p);
    if (I.spc && p.cd.spc <= 0) special(p);
    if (I.dash && p.dashT <= 0) dash(p, I.dashX != null ? { x: I.dashX, z: I.dashZ } : (Math.hypot(I.mx, I.mz) > .2 ? { x: I.mx, z: I.mz } : p.face));
    I.dashX = I.dashZ = null;
  }

  function physics(p, dt){
    p.t += dt;
    for (const k of ['stun', 'slow', 'charm', 'freeze', 'shield', 'anchor', 'invuln', 'grin', 'flash', 'launch', 'teeter']) if (p[k] > 0) p[k] = Math.max(0, p[k] - dt);
    for (const k of ['atk', 'spc', 'dash']) if (p.cd[k] > 0){ p.cd[k] -= dt; if (k === 'dash' && p.cd.dash <= 0) p.charges = p.kit.dash.kind === 'double' ? 2 : 1; }
    p.squash = Math.max(0, p.squash - dt * 5);
    if (p.state === 'out') return;
    if (p.state === 'fall'){ p.vy -= 1400 * dt; p.y += p.vy * dt; p.x += p.vx * dt * .4; p.z += p.vz * dt * .4; p.t2 = (p.t2 || 0) + dt; if (p.t2 > .9) loseStock(p); return; }
    if (p.state === 'respawn'){ p.t2 += dt; if (p.t2 > .7){ p.state = 'ok'; p.invuln = 1.3; } return; }
    if (p.burn > 0){ p.burn -= dt; p.burnTick -= dt; if (p.burnTick <= 0){ p.burnTick = .3; p.dmg += 1; if (Math.random() < .5) spark(p.x, p.z, '#ff8a3d', 2, 80); } }
    if (p.kit.aura.kind === 'regen'){ p.regenT += dt; if (p.regenT > 1.5){ p.regenT = 0; p.dmg = Math.max(0, p.dmg - 1); } }
    if (p.windup > 0){ p.windup -= dt; if (p.windup <= 0) fireLaser(p); }
    if (p.shield > 0 && p.shield - dt <= 0){ waves.push({ x: p.x, z: p.z, r: 0, max: 120, t: 0, life: .25, color: '#ff9bcb' }); sfx.pop(); const o = other(p); if (len(o.x - p.x, o.z - p.z) < 120 + o.r) hit(o, p, { dmg: 3, kb: 7, dx: o.x - p.x, dz: o.z - p.z, color: '#ff9bcb' }); }
    // rainbow stream
    if (p.puke > 0){
      p.puke -= dt; p.pukeTick -= dt;
      if (p.pukeTick <= 0){ p.pukeTick = .045; const a = Math.atan2(p.face.z, p.face.x) + rg(-.38, .38), hue = (p.t * 600) % 360;
        shoot(p, { vx: Math.cos(a) * 520, vz: Math.sin(a) * 520, life: .36, dmg: .9, kb: 1.7, color: `hsl(${hue},95%,65%)`, kind: 'puke', r: 9, noStop: true }); }
    }
    // dash / lunge movement
    const o = other(p);
    const moving = p.dashT > 0 || p.lunge > 0;
    if (moving){
      const sp = p.lunge > 0 ? 900 : p.dashSp;
      p.vx = p.dashDir.x * sp; p.vz = p.dashDir.z * sp;
      if (p.dashT > 0) p.dashT -= dt; if (p.lunge > 0) p.lunge -= dt;
      if (!p.dashHit && o.state === 'ok' && len(o.x - p.x, o.z - p.z) < p.r + o.r + 6){
        p.dashHit = true;
        const k = p.lunge > 0 ? 'chomp' : p.kit.dash.kind;
        const base = { chomp: [11, 11], gore: [7, 9], quick: [2, 6], anchor: [3, 7], slide: [3, 5.5], double: [2, 5], roll: [1, 3] }[k];
        hit(o, p, { dmg: base[0], kb: base[1], dx: p.dashDir.x, dz: p.dashDir.z, stun: p.kit.aura.kind === 'zap' ? .4 : 0, color: k === 'gore' ? '#f4ce87' : '#fff' });
        p.vx *= .2; p.vz *= .2; p.dashT = 0; p.lunge = 0;
      }
      if (Math.random() < .6) fx.push({ x: p.x, z: p.z, y: 4, vx: 0, vz: 0, vy: 0, life: .25, t: 0, color: 'rgba(255,255,255,.5)', size: p.r * .8, ghost: true });
    }
    // friction
    let fr = p.launch > 0 ? 2.4 : 9;
    if (puddles.some(u => (u.kind === 'slick' || u.kind === 'peel') && len(u.x - p.x, u.z - p.z) < u.r)) fr = .9;
    if (p.kit.dash.kind === 'slide' && p.dashT > 0) fr = 1;
    if (p.kit.body.perk === 'astro') fr *= .8;
    if (!moving){ const k = Math.exp(-fr * dt); p.vx *= k; p.vz *= k; }
    if (p.freeze > 0){ p.vx *= .5; p.vz *= .5; }
    {
      const d0 = len(p.x, p.z), nx = p.x / d0, nz = p.z / d0, out = p.vx * nx + p.vz * nz;
      // only a real launch carries a Chog over the edge; anything softer leaves it teetering on the lip
      if (d0 > R - p.r * .5 && out > 0 && (!(p.launch > 0) || Math.hypot(p.vx, p.vz) < 480)){ p.teeter = .25; p.vx -= nx * out; p.vz -= nz * out; if (p.lunge > 0 || p.dashT > 0){ p.dashT = 0; p.lunge = 0; } }
    }
    p.x += p.vx * dt; p.z += p.vz * dt;
    p.walk += Math.hypot(p.vx, p.vz) * dt * .05;
    // banana peels
    for (const u of puddles) if (u.kind === 'peel' && u.owner !== p.side && !u.used && len(u.x - p.x, u.z - p.z) < u.r + p.r * .5){ u.used = true; u.life = .3; p.stun = .5; p.vx += rg(-300, 300); p.vz += rg(-300, 300); say(p.x, p.z, 'SLIP', '#ffe27a', true); sfx.pop(); }
    // ring-out
    const d = len(p.x, p.z);
    if (d > R + 4){
      if (p.hover && !p.hovering){ p.hovering = .7; say(p.x, p.z, 'hover!', '#79e8ec'); }
      if (p.hovering > 0){ p.hovering -= dt; p.vx -= p.x / d * 900 * dt; p.vz -= p.z / d * 900 * dt; if (p.hovering <= 0) p.hover = false; }
      else if (p.duck){ p.duck = false; p.vx = -p.x / d * 700; p.vz = -p.z / d * 700; say(p.x, p.z, 'QUACK!', '#ffe27a', true); sfx.quack(); }
      else { p.state = 'fall'; p.t2 = 0; p.vy = 120; sfx.ringout(); other(p).ringouts++; slowmo = .35; shake = 20; crowdHype = 1.5; sfx.crowd(.45); say(p.x, p.z, 'RING OUT!', '#ff6b8a', true); onEvent?.({ type: 'ringout', side: p.side, dmg: Math.round(p.dmg), speed: Math.round(Math.hypot(p.vx, p.vz)), launch: +(p.launch || 0).toFixed(2), last: p.lastHit }); }
    } else if (d < R - 20) p.hovering = 0;
    // frog dad
    if (p.frog && p.dmg > 50 && p.state === 'ok'){ p.frog = false; frogs.push({ owner: p.side, x: p.x, z: p.z, t: 0, hops: 0 }); say(p.x, p.z, 'FROG DAD!', '#86d99a', true); sfx.frog(); onEvent?.({ type: 'frog', side: p.side }); }
  }

  function loseStock(p){
    p.stocks--; slowmo = 1;
    onEvent?.({ type: 'stock', side: p.side, left: p.stocks });
    if (p.stocks <= 0){ p.state = 'out'; finish(p.side === 0 ? false : true); return; }
    Object.assign(p, { state: 'respawn', t2: 0, x: p.side ? 120 : -120, z: -40, vx: 0, vz: 0, y: 0, vy: 0, dmg: 0, burn: 0, stun: 0, slow: 0, charm: 0, freeze: 0, puke: 0, dashT: 0, lunge: 0, windup: 0 });
    p.hover = p.kit.body.perk === 'astro'; p.frog = p.kit.acc.kind === 'frog';
  }

  function finish(won){
    if (over) return; over = true; phase = 'end'; phaseT = 0;
    result = { won, myStocks: P[0].stocks, foeStocks: P[1].stocks, seconds: Math.round(MATCH_S - clock), dealt: Math.round(P[0].dealt), taken: Math.round(P[1].dealt), ringouts: P[0].ringouts };
    won ? sfx.win() : sfx.lose(); sfx.crowd(.5);
    if (!headless) setTimeout(() => onEnd?.(result), 1600);
  }

  function step(dt){
    time += dt;
    for (let i = later.length - 1; i >= 0; i--) if (time >= later[i].at) { const l = later.splice(i, 1)[0]; l.f(); }
    if (phase === 'intro'){ phaseT += dt; const n = Math.ceil(3 - phaseT); if (n !== step.last && n > 0){ step.last = n; sfx.count(); } if (phaseT > 3){ phase = 'fight'; sfx.go(); sfx.crowd(.35); onEvent?.({ type: 'go' }); } }
    if (phase === 'fight'){
      clock -= dt;
      if (clock <= 0){ clock = 0; const a = P[0], b = P[1]; finish(a.stocks !== b.stocks ? a.stocks > b.stocks : a.dmg <= b.dmg); }
      if (auto){ think(0, dt); control(P[0], brains[0].input, dt); }
      else { readInput(); control(P[0], input, dt); input.atk = input.spc = input.dash = false; }
      think(1, dt); control(P[1], brains[1].input, dt);
    }
    if (phase !== 'intro') for (const p of P) physics(p, dt);
    // fighter collision
    const [a, b] = P;
    if (a.state === 'ok' && b.state === 'ok'){ const dx = b.x - a.x, dz = b.z - a.z, d = len(dx, dz), m = a.r + b.r; if (d < m){ const push = (m - d) / 2, nx = dx / d, nz = dz / d; a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
      // bumping into each other never shoves anyone off by itself
      for (const p of P){ const d = len(p.x, p.z); if (d > R - 2 && !(p.launch > 0 && Math.hypot(p.vx, p.vz) >= 480)){ p.x *= (R - 2) / d; p.z *= (R - 2) / d; } } } }
    // shots
    for (const s of shots){
      s.t += dt;
      if (s.homing){ const o = P[1 - s.owner], dx = o.x - s.x, dz = o.z - s.z, a1 = Math.atan2(s.vz, s.vx), a2 = Math.atan2(dz, dx); let da = ((a2 - a1 + Math.PI * 3) % TAU) - Math.PI; da = clamp(da, -s.homing * dt, s.homing * dt); const sp = len(s.vx, s.vz); s.vx = Math.cos(a1 + da) * sp; s.vz = Math.sin(a1 + da) * sp; }
      s.x += s.vx * dt; s.z += s.vz * dt;
      const o = P[1 - s.owner];
      if (o.state === 'ok' && len(o.x - s.x, o.z - s.z) < o.r + s.r){
        const r = hit(o, P[s.owner], { ...s, dx: s.vx, dz: s.vz, shot: true });
        if (r === 'reflect'){ s.owner = 1 - s.owner; s.vx *= -1; s.vz *= -1; s.t = 0; sfx.pop(); }
        else s.dead = true;
      }
      if (s.t > s.life) s.dead = true;
    }
    shots = shots.filter(s => !s.dead);
    // frogs hop toward the other Chog and bonk it
    for (const f of frogs){
      f.t += dt; const o = P[1 - f.owner];
      if (f.t > .32){ f.t = 0; f.hops++; const dx = o.x - f.x, dz = o.z - f.z, d = len(dx, dz); const st = Math.min(d, 90); f.x += dx / d * st; f.z += dz / d * st;
        if (d < 60 && o.state === 'ok'){ hit(o, P[f.owner], { dmg: 5, kb: 9, dx, dz, color: '#86d99a' }); f.dead = true; } if (f.hops > 12) f.dead = true; }
    }
    frogs = frogs.filter(f => !f.dead);
    for (const u of puddles){ u.t += dt; } puddles = puddles.filter(u => u.t < u.life);
    for (const w of waves){ w.t += dt; w.r = w.max * Math.min(1, w.t / w.life); } waves = waves.filter(w => w.t < w.life);
    for (const bm of beams) bm.t += dt; beams = beams.filter(bm => bm.t < bm.life);
    for (const f of fx){ f.t += dt; f.x += f.vx * dt; f.z += f.vz * dt; f.vy -= 700 * dt; f.y = Math.max(0, f.y + f.vy * dt); }
    fx = fx.filter(f => f.t < f.life);
    for (const t of texts) t.t += dt; texts = texts.filter(t => t.t < (t.big ? 1.1 : .7));
    crowdHype = Math.max(0, crowdHype - dt * .8);
    if (phase === 'end') phaseT += dt;
  }

  /* ---------- draw ---------- */
  const sx = x => CX + x * S, sy = (z, y = 0) => CY + z * S * TILT - y * S;
  function draw(){
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createRadialGradient(W / 2, H * .45, 40, W / 2, H * .5, Math.max(W, H) * .8);
    g.addColorStop(0, '#fff7fb'); g.addColorStop(.55, '#efe7ff'); g.addColorStop(1, '#d9cbff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    let ox = 0, oy = 0; if (shake > 0){ ox = rnd(-shake, shake); oy = rnd(-shake, shake); shake *= .86; if (shake < .3) shake = 0; }
    ctx.translate(ox, oy);
    // amphitheatre tiers + crowd behind the stage
    for (let row = 3; row >= 0; row--){
      const rr = R + 64 + row * 38;
      ctx.beginPath(); ctx.ellipse(sx(0), sy(0) - 14 * S - row * 20 * S, rr * S, rr * S * TILT, 0, Math.PI * 1.02, Math.PI * 1.98);
      ctx.strokeStyle = row % 2 ? 'rgba(201,182,255,.9)' : 'rgba(220,207,255,.95)'; ctx.lineWidth = 26 * S; ctx.stroke();
      ctx.strokeStyle = 'rgba(232,191,116,.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(sx(0), sy(0) - 14 * S - row * 20 * S + 13 * S, rr * S, rr * S * TILT, 0, Math.PI * 1.02, Math.PI * 1.98); ctx.stroke();
    }
    for (const c of crowd){
      if (c.row > 2) continue;
      const rr = R + 64 + c.row * 38, jump = Math.max(0, Math.sin(time * 6 + c.ph)) * (2 + crowdHype * 10);
      const x = sx(Math.cos(c.a) * rr), y = sy(Math.sin(c.a) * rr) - 22 * S - c.row * 20 * S - jump * S;
      ctx.globalAlpha = .85; ctx.fillStyle = c.c; ctx.beginPath(); ctx.arc(x, y, 4.6 * S, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff2d8'; ctx.beginPath(); ctx.arc(x, y + 1.2 * S, 2.4 * S, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
    // stage
    ctx.save();
    ctx.beginPath(); ctx.ellipse(sx(0), sy(0) + 26 * S, R * S, R * S * TILT, 0, 0, TAU); ctx.fillStyle = '#6a45c9'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx(0), sy(0), R * S, R * S * TILT, 0, 0, TAU);
    const sg = ctx.createLinearGradient(0, sy(-R), 0, sy(R)); sg.addColorStop(0, '#f6efff'); sg.addColorStop(1, '#d8c6f6');
    ctx.fillStyle = sg; ctx.fill(); ctx.clip();
    ctx.strokeStyle = 'rgba(137,85,216,.18)'; ctx.lineWidth = 2;
    for (const k of [.82, .55, .3]){ ctx.beginPath(); ctx.ellipse(sx(0), sy(0), R * k * S, R * k * TILT * S, 0, 0, TAU); ctx.stroke(); }
    for (let i = 0; i < 16; i++){ const a = i / 16 * TAU; ctx.beginPath(); ctx.moveTo(sx(Math.cos(a) * R * .3), sy(Math.sin(a) * R * .3)); ctx.lineTo(sx(Math.cos(a) * R * .82), sy(Math.sin(a) * R * .82)); ctx.stroke(); }
    // puddles
    for (const u of puddles){
      const al = Math.min(1, (u.life - u.t) * 2);
      ctx.globalAlpha = .55 * al;
      if (u.kind === 'slick'){ const gr = ctx.createRadialGradient(sx(u.x), sy(u.z), 4, sx(u.x), sy(u.z), u.r * S); ['#ff6b8a', '#ffd45c', '#86d99a', '#59e6ff', '#b06bff'].forEach((c, i) => gr.addColorStop(i / 4, c)); ctx.fillStyle = gr; }
      else if (u.kind === 'drool') ctx.fillStyle = '#bfefff';
      else { ctx.globalAlpha = al; ctx.fillStyle = '#ffe27a'; }
      ctx.beginPath(); ctx.ellipse(sx(u.x), sy(u.z), u.r * S, u.r * S * TILT, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(sx(0), sy(0), R * S, R * S * TILT, 0, 0, TAU); ctx.strokeStyle = '#e8bf74'; ctx.lineWidth = 6 * S; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(sx(0), sy(0), (R - 10) * S, (R - 10) * S * TILT, 0, 0, TAU); ctx.strokeStyle = 'rgba(201,154,82,.6)'; ctx.lineWidth = 2 * S; ctx.stroke();
    // waves
    for (const w of waves){
      ctx.globalAlpha = 1 - w.t / w.life; ctx.strokeStyle = w.color; ctx.lineWidth = 6 * S;
      ctx.beginPath();
      if (w.cone != null) ctx.ellipse(sx(w.x), sy(w.z), w.r * S, w.r * S * TILT, 0, w.cone - .55, w.cone + .55);
      else ctx.ellipse(sx(w.x), sy(w.z), w.r * S, w.r * S * TILT, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // depth-sorted things: fighters, shots, frogs
    const items = [...P.map(p => ({ z: p.z, f: () => fighter(p) })), ...shots.map(s => ({ z: s.z, f: () => shot(s) })), ...frogs.map(f => ({ z: f.z, f: () => frog(f) }))];
    items.sort((a, b) => a.z - b.z).forEach(i => i.f());
    // beams on top
    ctx.globalCompositeOperation = 'lighter';
    for (const bm of beams){ const al = 1 - bm.t / bm.life; ctx.strokeStyle = bm.color; ctx.globalAlpha = al; ctx.lineCap = 'round';
      [16, 8, 3].forEach((w, i) => { ctx.lineWidth = w * S; if (i === 2) ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(sx(bm.x1), sy(bm.z1, 30)); ctx.lineTo(sx(bm.x2), sy(bm.z2, 30)); ctx.stroke(); }); }
    for (const p of P) if (p.windup > 0){ ctx.globalAlpha = .6; ctx.strokeStyle = p.kit.eyes.color; ctx.lineWidth = 2 * S; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(sx(p.x), sy(p.z, 30)); ctx.lineTo(sx(p.x + p.face.x * 380), sy(p.z + p.face.z * 380, 30)); ctx.stroke(); ctx.setLineDash([]); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    // particles
    for (const f of fx){
      const al = 1 - f.t / f.life; ctx.globalAlpha = al;
      if (f.slash){ ctx.strokeStyle = '#fff'; ctx.lineWidth = 4 * S; ctx.beginPath(); ctx.ellipse(sx(f.x), sy(f.z, 26), 34 * S, 20 * S, f.a, -1, 1); ctx.stroke(); continue; }
      if (f.ghost){ ctx.fillStyle = f.color; ctx.beginPath(); ctx.ellipse(sx(f.x), sy(f.z, 22), f.size * S, f.size * S * .9, 0, 0, TAU); ctx.fill(); continue; }
      ctx.fillStyle = f.color; ctx.fillRect(sx(f.x) - f.size * S / 2, sy(f.z, f.y) - f.size * S / 2, f.size * S, f.size * S);
    }
    ctx.globalAlpha = 1;
    for (const t of texts){
      const life = t.big ? 1.1 : .7, al = 1 - t.t / life;
      ctx.globalAlpha = al; ctx.font = `800 ${(t.big ? 30 : 18) * Math.max(.8, S)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,9,31,.75)'; const y = sy(t.z, (t.big ? 150 : 120) + t.t * 70);
      ctx.strokeText(t.text, sx(t.x), y); ctx.fillStyle = t.color; ctx.fillText(t.text, sx(t.x), y);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    hud();
  }

  function fighter(p){
    const x = sx(p.x), base = sy(p.z, p.y);
    let k = S * (p.state === 'fall' ? Math.max(.2, 1 - (p.t2 || 0)) : 1);
    if (p.state === 'respawn') k *= Math.min(1, p.t2 / .5);
    const al = p.state === 'respawn' ? Math.min(1, p.t2 * 2) : p.invuln > 0 ? (Math.sin(time * 30) > 0 ? .55 : 1) : 1;
    if (p.state !== 'fall'){ ctx.globalAlpha = .28; ctx.fillStyle = '#2a1450'; ctx.beginPath(); ctx.ellipse(x, sy(p.z), p.r * 1.1 * k, p.r * .5 * k, 0, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = al;
    const sq = 1 + Math.sin(p.squash * 9) * p.squash * .18, bob = Math.abs(Math.sin(p.walk * 3)) * 3 * k;
    // feet
    ctx.fillStyle = shade(p.kit.skin, -.25);
    [-1, 1].forEach(s => { ctx.beginPath(); ctx.ellipse(x + s * p.r * .45 * k + Math.sin(p.walk * 3 + s) * 3 * k, base - 2 * k, p.r * .32 * k, p.r * .2 * k, 0, 0, TAU); ctx.fill(); });
    // body
    ctx.fillStyle = p.flash > 0 ? '#fff' : p.kit.skin; ctx.strokeStyle = '#2a1450'; ctx.lineWidth = 2.5 * k;
    ctx.beginPath(); ctx.ellipse(x, base - p.r * .7 * k - bob, p.r * .78 * k / sq, p.r * .7 * k * sq, 0, 0, TAU); ctx.fill(); ctx.stroke();
    // aura ring
    if (p.kit.aura.kind !== 'none'){ ctx.strokeStyle = p.kit.aura.color; ctx.globalAlpha = al * (.45 + Math.sin(time * 4) * .2); ctx.lineWidth = 3 * k; ctx.beginPath(); ctx.ellipse(x, sy(p.z) , p.r * 1.25 * k, p.r * .55 * k, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = al; }
    // head: the real Chog art in a gold medallion; flips to face the way the Chog is moving
    const hr = p.r * 1.12 * k, hy = base - p.r * 1.9 * k - bob;
    const flip = (p.face.x >= 0 ? 1 : -1) * p.kit.faces;
    ctx.save(); ctx.translate(x, hy); ctx.scale(flip, 1);
    ctx.beginPath(); ctx.arc(0, 0, hr, 0, TAU); ctx.fillStyle = '#d9c6f5'; ctx.fill();
    if (p.img.complete && p.img.naturalWidth){ ctx.save(); ctx.clip(); ctx.drawImage(p.img, -hr * 1.08, -hr * 1.08, hr * 2.16, hr * 2.16); ctx.restore(); }
    ctx.restore();
    ctx.beginPath(); ctx.arc(x, hy, hr, 0, TAU); ctx.strokeStyle = p.flash > 0 ? '#fff' : p.side ? '#ff9bcb' : '#e8bf74'; ctx.lineWidth = 4 * k; ctx.stroke();
    if (p.freeze > 0){ ctx.fillStyle = 'rgba(160,235,255,.45)'; ctx.beginPath(); ctx.arc(x, hy, hr + 3, 0, TAU); ctx.fill(); }
    if (p.shield > 0){ ctx.globalAlpha = al * .5; ctx.fillStyle = '#ffb3d6'; ctx.beginPath(); ctx.arc(x, base - p.r * 1.2 * k, p.r * 2.2 * k, 0, TAU); ctx.fill(); ctx.globalAlpha = al; ctx.strokeStyle = '#ff7fb6'; ctx.lineWidth = 2; ctx.stroke(); }
    if (p.stun > 0) for (let i = 0; i < 3; i++){ const a = time * 6 + i * 2.1; ctx.fillStyle = '#ffe27a'; ctx.font = `${14 * k}px sans-serif`; ctx.fillText('★', x + Math.cos(a) * hr, hy - hr - 6 * k + Math.sin(a) * 5 * k); }
    if (p.teeter > 0 && p.state === 'ok'){ ctx.fillStyle = '#ffe27a'; ctx.font = `800 ${18 * k}px Inter, sans-serif`; ctx.fillText('!', x + Math.sin(time * 40) * 2, hy - hr - 26 * k); }
    if (p.charm > 0){ ctx.fillStyle = '#ff7fb6'; ctx.font = `${16 * k}px sans-serif`; ctx.fillText('♥', x, hy - hr - 8 * k); }
    // damage
    if (p.state === 'ok' || p.state === 'respawn'){
      const pct = Math.round(p.dmg), c = pct < 50 ? '#ffffff' : pct < 100 ? '#ffd45c' : pct < 150 ? '#ff9b3d' : '#ff5b6e';
      ctx.font = `800 ${16 * Math.max(.85, k)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,9,31,.8)';
      ctx.strokeText(`${pct}%`, x, hy - hr - 10 * k); ctx.fillStyle = c; ctx.fillText(`${pct}%`, x, hy - hr - 10 * k);
    }
    ctx.globalAlpha = 1;
  }

  function shot(s){
    const x = sx(s.x), y = sy(s.z, 26);
    ctx.save(); ctx.globalCompositeOperation = s.kind === 'puke' ? 'source-over' : 'lighter';
    if (s.kind === 'heart'){ ctx.fillStyle = s.color; ctx.font = `${24 * S}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('♥', x, y + 8 * S); }
    else if (s.kind === 'coin'){ ctx.fillStyle = '#ffd45c'; ctx.strokeStyle = '#c99a52'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, 9 * S, 9 * S * Math.abs(Math.sin(s.t * 18)) + 2, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
    else { const r = s.r * S; const gr = ctx.createRadialGradient(x, y, 1, x, y, r * 1.8); gr.addColorStop(0, '#fff'); gr.addColorStop(.35, s.color); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  function frog(f){ const x = sx(f.x), hop = Math.sin(Math.min(1, f.t / .32) * Math.PI) * 30; ctx.font = `${30 * S}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('🐸', x, sy(f.z, hop) + 10 * S); }

  function hud(){
    const narrow = W < 600, pad = narrow ? 10 : 16, cw = narrow ? (W - pad * 3) / 2 : Math.min(300, W * .42), ch = narrow ? 54 : 64, top = narrow ? 64 : pad;
    P.forEach((p, i) => {
      const x = i ? W - pad - cw : pad, y = top, av = narrow ? 36 : 46, max = narrow ? 11 : 22;
      ctx.fillStyle = '#dccfff'; rr(x, y + 5, cw, ch, 20); ctx.fill();
      ctx.fillStyle = '#ffffff'; rr(x, y, cw, ch, 20); ctx.fill();
      const ix = i ? x + cw - av - 9 : x + 9;
      ctx.save(); ctx.beginPath(); ctx.arc(ix + av / 2, y + ch / 2, av / 2, 0, TAU); ctx.clip(); if (p.img.complete && p.img.naturalWidth) ctx.drawImage(p.img, ix, y + (ch - av) / 2, av, av); ctx.restore();
      ctx.textAlign = i ? 'right' : 'left'; const tx = i ? ix - 9 : ix + av + 9;
      ctx.fillStyle = '#2b1b5a'; ctx.font = `700 ${narrow ? 12 : 14}px Fredoka, Inter, system-ui, sans-serif`; ctx.fillText(p.name.length > max ? p.name.slice(0, max - 1) + '…' : p.name, tx, y + (narrow ? 22 : 26));
      ctx.font = `800 ${narrow ? 17 : 20}px Inter, system-ui, sans-serif`; const pct = Math.round(p.dmg); ctx.fillStyle = pct < 50 ? '#7b4cf0' : pct < 100 ? '#e09a00' : '#e0456f'; ctx.fillText(`${pct}%`, tx, y + (narrow ? 43 : 50));
      for (let s = 0; s < STOCKS; s++){ const dx = i ? tx - (narrow ? 50 : 60) - s * 14 : tx + (narrow ? 50 : 60) + s * 14; ctx.fillStyle = s < p.stocks ? (i ? '#ff7aa8' : '#7b4cf0') : '#e8e0fb'; ctx.beginPath(); ctx.arc(dx, y + (narrow ? 38 : 44), 5, 0, TAU); ctx.fill(); }
    });
    ctx.textAlign = 'center'; ctx.fillStyle = '#3a1d9c'; ctx.font = '700 24px Fredoka, Inter, system-ui, sans-serif';
    const m = Math.floor(clock / 60), s = Math.floor(clock % 60); ctx.fillText(`${m}:${String(s).padStart(2, '0')}`, W / 2, narrow ? top + ch + 28 : 44);
    if (phase === 'intro'){ const n = Math.ceil(3 - phaseT); big(n > 0 ? String(n) : 'RUMBLE!', '#ffbf3c'); }
    if (phase === 'fight' && time < 3.8 + 0.6) big('RUMBLE!', '#ffbf3c', Math.max(0, 1 - (time - 3) * 1.6));
    if (phase === 'end' && result && phaseT < 1.5) {
      if (spectate) big(`${(result.won ? me : foe).name.toUpperCase()} WINS`, '#f4ce87', 1 - phaseT / 1.5);
      else big(result.won ? 'YOU WIN' : 'KNOCKED OUT', result.won ? '#f4ce87' : '#ff9bcb', 1 - phaseT / 1.5);
    }
  }
  function big(text, color, alpha = 1){
    if (alpha <= 0) return;
    ctx.globalAlpha = alpha; ctx.textAlign = 'center'; ctx.font = `700 ${Math.min(104, W * .14)}px Fredoka, Inter, system-ui, sans-serif`;
    ctx.lineWidth = 12; ctx.strokeStyle = '#3a1d9c'; ctx.strokeText(text, W / 2, H * .42); ctx.fillStyle = color; ctx.fillText(text, W / 2, H * .42); ctx.globalAlpha = 1;
  }
  function rr(x, y, w, h, r){ ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function shade(hex, k){ const n = parseInt(hex.slice(1), 16), f = c => clamp(Math.round(c * (1 + k)), 0, 255); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }

  /* ---------- loop ---------- */
  let last = performance.now(), raf = 0, dead = false, ticks = 0;
  function advance(raw){
    if (hitstop > 0) hitstop -= raw;
    else { slowmo += (1 - slowmo) * Math.min(1, raw * 2.2); step(raw * slowmo); }
  }
  // synced fights move in fixed ticks counted from startAt, so every viewer sees the same frame at the same moment
  function tick(){ advance(TICK); ticks++; }
  function frame(now){
    if (startAt != null || seed != null && headless) {
      const want = startAt != null ? Math.floor((Date.now() - startAt) / 1000 * 60) : ticks;
      for (let n = 0; ticks < want && n < 3600; n++) tick();
    } else { const raw = Math.min(.05, (now - last) / 1000); last = now; advance(raw); }
    if (!headless) draw();
  }
  function loop(now){ if (dead) return; frame(now); raf = requestAnimationFrame(loop); }
  if (!headless) raf = requestAnimationFrame(loop);

  return {
    /** mobile controls */
    stick(v){ input.stick = v; },
    press(k){ unlock(); if (k === 'atk') input.atk = true; if (k === 'spc') input.spc = true; if (k === 'dash') input.dash = true; },
    cooldowns(){ const p = P[0]; return { atk: p.cd.atk, spc: Math.max(0, p.cd.spc), dash: Math.max(0, p.cd.dash), charges: p.charges }; },
    /** advance by hand (headless checks, demo capture) */
    step(n = 60){ for (let i = 0; i < n; i++){ last -= 1000 / 60; frame(performance.now()); } },
    state(){ return { phase, clock, ticks, P: P.map(p => ({ x: p.x, z: p.z, dmg: p.dmg, stocks: p.stocks, state: p.state })), result }; },
    /** headless: play the whole fight now and return the result and how many ticks it took */
    run(){ while (!over && ticks < 60 * 400) tick(); return { ...result, ticks }; },
    dispose(){ dead = true; if (headless) return; cancelAnimationFrame(raf); removeEventListener('resize', resize); removeEventListener('keydown', kd); removeEventListener('keyup', ku); canvas.removeEventListener('pointermove', mm); canvas.removeEventListener('pointerdown', md); canvas.removeEventListener('contextmenu', cm); },
  };
}
