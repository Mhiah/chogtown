/* eslint-disable */
// @ts-nocheck
/*
 * Face Booth stage: your Chog in the middle, jeets drifting in, and your face firing the
 * Chog's own trait powers at them (auto-aimed at the nearest one).
 * eyes()  -> the Eyes trait's attack     mouth(open) -> the Mouth trait's power
 */
import { sfx, unlock } from '@/arena/sfx';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const JEETS = ['JEET', 'RUG', 'FUD', 'PAPER', 'DUMP', 'NGMI'];

export function createStage({ canvas, chog, onScore }){
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, R = 100, CX = 0, CY = 0;
  function resize(){ dpr = Math.min(devicePixelRatio || 1, 2); W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; R = Math.min(W, H) * .17; CX = W / 2; CY = H * .54; }
  resize(); addEventListener('resize', resize);
  const img = new Image(); img.src = chog.image;
  const kit = chog.kit;

  let jeets = [], shots = [], beams = [], waves = [], fx = [], texts = [], puddles = [];
  let t = 0, spawnT = 1, score = 0, combo = 0, comboT = 0, hearts = 5, shield = 0, grin = 0, puke = 0, chomp = 0, shake = 0, flash = 0, over = false, mouthOpen = false;
  const eyeL = () => ({ x: CX - R * .2, y: CY - R * .12 }), eyeR = () => ({ x: CX + R * .2, y: CY - R * .12 }), mouthP = () => ({ x: CX, y: CY + R * .32 });

  function nearest(from){ let best = null, bd = 1e9; for (const j of jeets){ const d = Math.hypot(j.x - from.x, j.y - from.y); if (d < bd){ bd = d; best = j; } } return best; }
  const aim = from => { const j = nearest(from); return j ? Math.atan2(j.y - from.y, j.x - from.x) : -Math.PI / 2 + rnd(-.6, .6); };
  const say = (x, y, text, color = '#fff', big = false) => texts.push({ x, y, text, color, big, t: 0 });
  const spark = (x, y, color, n = 12) => { for (let i = 0; i < n; i++){ const a = Math.random() * TAU, v = rnd(80, 320); fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(.3, .7), t: 0, color, s: rnd(3, 7) }); } };
  const mult = () => (grin > 0 ? 2 : 1) * (kit.power || 1);

  function damage(j, d, color){
    j.hp -= d * mult(); j.flash = .12; spark(j.x, j.y, color || '#fff', 6);
    if (j.hp <= 0 && !j.dead){
      j.dead = true; combo++; comboT = 2.2; const pts = 10 * Math.min(combo, 8); score += pts; onScore?.(score);
      spark(j.x, j.y, '#f4ce87', 18); say(j.x, j.y, combo > 1 ? `+${pts} ×${combo}` : `+${pts}`, '#f4ce87'); sfx.hit(1); shake = Math.min(10, shake + 3);
    }
  }

  /* ---------- the face buttons ---------- */
  function eyes(){
    if (over) return; unlock();
    const e = kit.eyes, L = eyeL(), Rr = eyeR();
    say(CX, CY - R * 1.25, e.name, e.color);
    if (e.kind === 'laser'){
      sfx.laser();
      for (const o of [L, Rr]){
        const a = aim(o), len = Math.max(W, H);
        beams.push({ x1: o.x, y1: o.y, x2: o.x + Math.cos(a) * len, y2: o.y + Math.sin(a) * len, color: e.color, t: 0 });
        for (const j of jeets){ const rx = j.x - o.x, ry = j.y - o.y, proj = rx * Math.cos(a) + ry * Math.sin(a); if (proj > 0 && Math.abs(rx * Math.sin(a) - ry * Math.cos(a)) < j.r + 8) damage(j, 2, e.color); }
      }
      flash = .08; return;
    }
    const shot = (o, a, sp, extra) => shots.push({ x: o.x, y: o.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 1.6, r: 9, dmg: 1, color: e.color, ...extra });
    if (e.kind === 'tears'){ sfx.tears(); for (const o of [L, Rr]){ const a = aim(o); [-.18, 0, .18].forEach(d => shot(o, a + d, 620, { kind: 'tear' })); } }
    if (e.kind === 'hearts'){ sfx.heart(); for (const o of [L, Rr]) shot(o, aim(o), 360, { kind: 'heart', homing: 4, r: 12, life: 2.5 }); }
    if (e.kind === 'bolts'){ sfx.bolt(); for (const o of [L, Rr]) shot(o, aim(o), 900, { kind: 'bolt' }); setTimeout(() => { for (const o of [eyeL(), eyeR()]) shot(o, aim(o), 900, { kind: 'bolt' }); }, 90); }
    if (e.kind === 'stare'){ sfx.stare(); const o = { x: CX, y: CY - R * .12 }; shot(o, aim(o), 300, { kind: 'stare', r: 22, dmg: 3, pierce: true, life: 3 }); }
    if (e.kind === 'spit'){ sfx.spit(); const o = mouthP(); shot(o, aim(o), 700, { kind: 'spit', dmg: 1.5 }); }
  }

  function mouth(open){
    if (over) return; unlock();
    mouthOpen = open;
    if (!open) return;
    const m = kit.mouth, o = mouthP();
    say(CX, CY + R * 1.45, m.name, '#ff9bcb');
    if (m.kind === 'puke'){ puke = 1.6; sfx.puke(); }
    if (m.kind === 'bubble'){ shield = 3.5; sfx.bubble(); }
    if (m.kind === 'drool'){ sfx.drool(); const j = nearest(o); const x = j ? j.x : CX + rnd(-200, 200), y = j ? j.y : CY - 160; puddles.push({ x, y, r: R * 1.1, t: 0, life: 4 }); }
    if (m.kind === 'coins'){ sfx.coins(); const a = aim(o); for (let i = -3; i <= 3; i++) shots.push({ x: o.x, y: o.y, vx: Math.cos(a + i * .16) * 700, vy: Math.sin(a + i * .16) * 700, t: 0, life: 1.4, r: 10, dmg: 1, color: '#ffd45c', kind: 'coin' }); }
    if (m.kind === 'honk'){ sfx.honk(); waves.push({ x: o.x, y: o.y, r: 0, max: Math.max(W, H) * .42, t: 0, life: .5, color: '#ff6b8a', hit: new Set() }); shake = 14; }
    if (m.kind === 'chomp'){ sfx.chomp(); chomp = .35; const j = nearest(o); if (j && Math.hypot(j.x - CX, j.y - CY) < R * 4.5){ damage(j, 4, '#fff'); say(j.x, j.y, 'CHOMP', '#fff', true); } }
    if (m.kind === 'wail'){ sfx.wail(); const a = aim(o); waves.push({ x: o.x, y: o.y, r: 0, max: Math.max(W, H) * .5, t: 0, life: .6, color: '#9fd8ff', cone: a, hit: new Set() }); }
    if (m.kind === 'grin'){ sfx.grin(); grin = 4; hearts = Math.min(5, hearts + 1); say(CX, CY - R * 1.5, 'POWER GRIN ×2', '#f4ce87', true); spark(CX, CY, '#a4e8c4', 24); }
  }

  /* ---------- loop ---------- */
  function step(dt){
    t += dt;
    shield = Math.max(0, shield - dt); grin = Math.max(0, grin - dt); chomp = Math.max(0, chomp - dt); flash = Math.max(0, flash - dt);
    if (comboT > 0){ comboT -= dt; if (comboT <= 0) combo = 0; }
    // jeets drift in from the edges, faster as the score climbs
    spawnT -= dt;
    if (spawnT <= 0 && !over){
      spawnT = Math.max(.45, 1.5 - score / 1500);
      const a = Math.random() * TAU, d = Math.max(W, H) * .62;
      jeets.push({ x: CX + Math.cos(a) * d, y: CY + Math.sin(a) * d * .8, r: rnd(22, 30), hp: score > 400 && Math.random() < .3 ? 3 : 1, sp: rnd(45, 80) + score / 40, label: JEETS[Math.floor(Math.random() * JEETS.length)], wob: Math.random() * 6, flash: 0 });
    }
    for (const j of jeets){
      const dx = CX - j.x, dy = CY - j.y, d = Math.hypot(dx, dy) || 1;
      let sp = j.sp; if (puddles.some(p => Math.hypot(p.x - j.x, p.y - j.y) < p.r)){ sp *= .25; if (Math.random() < dt * 2) damage(j, 1, '#bfefff'); }
      j.x += dx / d * sp * dt + Math.sin(t * 3 + j.wob) * 20 * dt; j.y += dy / d * sp * dt;
      if (j.flash > 0) j.flash -= dt;
      if (shield > 0 && d < R * 1.6){ damage(j, 9, '#ff9bcb'); }
      else if (d < R * .95 && !j.dead){ j.dead = true; hearts--; combo = 0; shake = 16; spark(j.x, j.y, '#ff6b8a', 16); sfx.big(); say(CX, CY - R * 1.2, `-1 heart`, '#ff6b8a', true); if (hearts <= 0){ over = true; sfx.lose(); } }
    }
    jeets = jeets.filter(j => !j.dead);
    // rainbow puke stream while the mouth stays open
    if (puke > 0 && mouthOpen){ puke -= dt; const o = mouthP(), a = aim(o); for (let i = 0; i < 3; i++){ const aa = a + rnd(-.3, .3); shots.push({ x: o.x, y: o.y, vx: Math.cos(aa) * rnd(520, 700), vy: Math.sin(aa) * rnd(520, 700), t: 0, life: .7, r: 8, dmg: .35, color: `hsl(${(t * 700 + i * 40) % 360},95%,65%)`, kind: 'puke' }); } }
    for (const s of shots){
      s.t += dt;
      if (s.homing){ const j = nearest(s); if (j){ const a1 = Math.atan2(s.vy, s.vx), a2 = Math.atan2(j.y - s.y, j.x - s.x); let da = ((a2 - a1 + Math.PI * 3) % TAU) - Math.PI; da = Math.max(-s.homing * dt, Math.min(s.homing * dt, da)); const sp = Math.hypot(s.vx, s.vy); s.vx = Math.cos(a1 + da) * sp; s.vy = Math.sin(a1 + da) * sp; } }
      s.x += s.vx * dt; s.y += s.vy * dt;
      for (const j of jeets) if (!j.dead && Math.hypot(j.x - s.x, j.y - s.y) < j.r + s.r){ damage(j, s.dmg, s.color); if (!s.pierce){ s.dead = true; break; } }
      if (s.t > s.life) s.dead = true;
    }
    shots = shots.filter(s => !s.dead);
    for (const w of waves){ w.t += dt; w.r = w.max * Math.min(1, w.t / w.life);
      for (const j of jeets){ if (w.hit.has(j)) continue; const dx = j.x - w.x, dy = j.y - w.y, d = Math.hypot(dx, dy); if (d < w.r && (w.cone == null || Math.abs(((Math.atan2(dy, dx) - w.cone + Math.PI * 3) % TAU) - Math.PI) < .6)){ w.hit.add(j); damage(j, 3, w.color); } } }
    waves = waves.filter(w => w.t < w.life);
    for (const b of beams) b.t += dt; beams = beams.filter(b => b.t < .18);
    for (const p of puddles) p.t += dt; puddles = puddles.filter(p => p.t < p.life);
    for (const f of fx){ f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 300 * dt; } fx = fx.filter(f => f.t < f.life);
    for (const x of texts) x.t += dt; texts = texts.filter(x => x.t < (x.big ? 1.2 : .8));
  }

  function draw(){
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createRadialGradient(CX, CY, 20, CX, CY, Math.max(W, H) * .75); g.addColorStop(0, '#3b1d78'); g.addColorStop(1, '#120826');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (shake > 0){ ctx.translate(rnd(-shake, shake), rnd(-shake, shake)); shake *= .86; if (shake < .3) shake = 0; }
    for (const p of puddles){ ctx.globalAlpha = .45 * (1 - p.t / p.life); ctx.fillStyle = '#bfefff'; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * .7, 0, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    // the Chog
    const bob = Math.sin(t * 2) * 4, sc = 1 + (chomp > 0 ? Math.sin(chomp / .35 * Math.PI) * .12 : 0) + (mouthOpen ? .04 : 0);
    ctx.save(); ctx.translate(CX, CY + bob); ctx.scale(sc, sc);
    ctx.shadowColor = kit.aura.color; ctx.shadowBlur = 40; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fillStyle = '#d9c6f5'; ctx.fill(); ctx.shadowBlur = 0;
    if (img.complete && img.naturalWidth){ ctx.save(); ctx.clip(); ctx.drawImage(img, -R * 1.06, -R * 1.06, R * 2.12, R * 2.12); ctx.restore(); }
    ctx.lineWidth = 5; ctx.strokeStyle = grin > 0 ? '#a4e8c4' : '#e8bf74'; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    ctx.restore();
    if (shield > 0){ ctx.globalAlpha = .35 + Math.sin(t * 10) * .05; ctx.fillStyle = '#ffb3d6'; ctx.beginPath(); ctx.arc(CX, CY, R * 1.6, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = '#ff7fb6'; ctx.lineWidth = 3; ctx.stroke(); }
    // jeets
    for (const j of jeets){
      ctx.save(); ctx.translate(j.x, j.y);
      ctx.fillStyle = j.flash > 0 ? '#fff' : j.hp > 1 ? '#c2335a' : '#e2626a'; ctx.strokeStyle = '#2a1450'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, j.r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `800 ${j.r * .5}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(j.label, 0, 1);
      ctx.restore();
    }
    // beams + shots
    ctx.globalCompositeOperation = 'lighter';
    for (const b of beams){ ctx.globalAlpha = 1 - b.t / .18; ctx.lineCap = 'round'; [[18, b.color], [8, b.color], [3, '#fff']].forEach(([w, c]) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke(); }); }
    ctx.globalAlpha = 1;
    for (const s of shots){
      if (s.kind === 'heart'){ ctx.fillStyle = s.color; ctx.font = `${s.r * 2.2}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♥', s.x, s.y); continue; }
      if (s.kind === 'coin'){ ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#ffd45c'; ctx.strokeStyle = '#c99a52'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r, s.r * Math.abs(Math.sin(s.t * 16)) + 2, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.globalCompositeOperation = 'lighter'; continue; }
      const gr = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, s.r * 1.8); gr.addColorStop(0, '#fff'); gr.addColorStop(.4, s.color); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 1.8, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const w of waves){ ctx.globalAlpha = 1 - w.t / w.life; ctx.strokeStyle = w.color; ctx.lineWidth = 8; ctx.beginPath(); if (w.cone != null) ctx.arc(w.x, w.y, w.r, w.cone - .6, w.cone + .6); else ctx.arc(w.x, w.y, w.r, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1;
    for (const f of fx){ ctx.globalAlpha = 1 - f.t / f.life; ctx.fillStyle = f.color; ctx.fillRect(f.x - f.s / 2, f.y - f.s / 2, f.s, f.s); }
    ctx.globalAlpha = 1;
    for (const x of texts){ const life = x.big ? 1.2 : .8; ctx.globalAlpha = 1 - x.t / life; ctx.font = `800 ${x.big ? 28 : 18}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,9,31,.8)'; const y = x.y - x.t * 50; ctx.strokeText(x.text, x.x, y); ctx.fillStyle = x.color; ctx.fillText(x.text, x.x, y); }
    ctx.globalAlpha = 1;
    if (flash > 0){ ctx.fillStyle = `rgba(255,255,255,${flash * 2})`; ctx.fillRect(0, 0, W, H); }
    // HUD
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff2d8'; ctx.font = '800 34px Inter, system-ui, sans-serif'; ctx.fillText(`${score}`, W / 2, 50);
    ctx.font = '600 12px Inter, system-ui, sans-serif'; ctx.fillStyle = 'rgba(251,247,255,.6)'; ctx.fillText(combo > 1 ? `combo ×${combo}` : 'jeets blasted', W / 2, 68);
    ctx.textAlign = 'right'; ctx.font = '20px sans-serif'; ctx.fillStyle = '#ff9bcb'; ctx.fillText('♥'.repeat(Math.max(0, hearts)), W - 18, 40);
    if (over){ ctx.textAlign = 'center'; ctx.font = '900 54px Inter, system-ui, sans-serif'; ctx.fillStyle = '#ff9bcb'; ctx.fillText('JEETED', W / 2, H * .22); ctx.font = '600 15px Inter, system-ui, sans-serif'; ctx.fillStyle = '#fbf7ff'; ctx.fillText('Press R or tap Again to play again', W / 2, H * .22 + 30); }
  }

  let last = performance.now(), raf = 0, dead = false;
  const loop = now => { if (dead) return; const dt = Math.min(.05, (now - last) / 1000); last = now; step(dt); draw(); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  return {
    eyes, mouth,
    reset(){ jeets = []; shots = []; waves = []; puddles = []; score = 0; combo = 0; hearts = 5; over = false; spawnT = 1; onScore?.(0); },
    state: () => ({ score, hearts, over, jeets: jeets.length }),
    step(n = 60){ for (let i = 0; i < n; i++){ last -= 1000 / 60; step(1 / 60); } draw(); },
    dispose(){ dead = true; cancelAnimationFrame(raf); removeEventListener('resize', resize); },
  };
}
