/* eslint-disable */
// @ts-nocheck
/*
 * Draws the live island on a canvas laid exactly over the island art: every Chog as a little standee
 * (its NFT art on a white sticker card, on a base, with a shadow), waddling when it walks, with speech bubbles.
 */

import { NODES } from './map.js';

const INK = '#2b1b5a', ROYAL = '#7b4cf0', ROSE = '#ff7aa8';
const imgs = new Map();
export function art(src) {
  if (!src) return null;
  let i = imgs.get(src);
  if (!i) { i = new Image(); i.decoding = 'async'; i.src = src; imgs.set(src, i); }
  return i.complete && i.naturalWidth ? i : null;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function wrap(ctx, text, max) {
  const words = text.split(' '), out = []; let line = '';
  for (const w of words) {
    const next = line ? line + ' ' + w : w;
    if (ctx.measureText(next).width > max && line) { out.push(line); line = w; } else line = next;
  }
  if (line) out.push(line);
  if (out.length > 4) { out.length = 4; out[3] = out[3].replace(/\s*\S*$/, '') + '…'; }
  return out;
}

/**
 * view: { W, H (canvas css px), base (card size in px at mid depth), which: 'w'|'t', dpr, still (reduced motion) }
 * Returns the hit boxes drawn this frame, front-most last.
 */
export function drawIsland(ctx, sim, view, now, hover) {
  const { W, H, base, which, dpr, still } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const list = sim.chogs.filter((c) => c.out || c.fade > 0).map((c) => ({ c, p: sim.where(c, which) })).sort((a, b) => a.p.y - b.p.y);
  const hits = [];
  const bubbles = [];
  for (const { c, p } of list) {
    const x = p.x * W, y = p.y * H;
    const depth = which === 't' ? .8 + (p.y - .5) * 1.4 : .78 + (p.y - .45) * 1.3;
    const s = base * Math.max(.6, depth) * (c.mine ? 1.25 : 1);
    const ph = now * 9 + c.id;
    const bob = c.walking && !still ? Math.abs(Math.sin(ph)) * s * .14 : (still ? 0 : Math.sin(now * 2 + c.id) * s * .015);
    const tilt = c.walking && !still ? Math.sin(ph) * .09 : 0;
    ctx.globalAlpha = c.fade;
    // shadow
    ctx.fillStyle = 'rgba(60,30,120,.22)';
    ctx.beginPath(); ctx.ellipse(x, y, s * .42 - bob * .5, s * .13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(x, y - bob); ctx.rotate(tilt);
    if (c.fade < 1) { const k = .6 + .4 * c.fade; ctx.scale(k, k); }
    // base disc
    ctx.fillStyle = c.mine ? ROSE : '#fff';
    ctx.beginPath(); ctx.ellipse(0, -s * .04, s * .34, s * .1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c.mine ? '#e85d8f' : '#dccfff';
    ctx.fillRect(-s * .05, -s * .2, s * .1, s * .16);
    // card
    const cw = s, ch = s, cx = -cw / 2, cy = -s * .2 - ch;
    ctx.shadowColor = 'rgba(43,27,90,.28)'; ctx.shadowBlur = s * .18; ctx.shadowOffsetY = s * .06;
    ctx.fillStyle = '#fff'; rr(ctx, cx - s * .07, cy - s * .07, cw + s * .14, ch + s * .14, s * .2); ctx.fill();
    ctx.shadowColor = 'transparent';
    const im = art(c.image);
    ctx.save(); rr(ctx, cx, cy, cw, ch, s * .14); ctx.clip();
    if (im) { ctx.scale(c.face < 0 ? -1 : 1, 1); ctx.drawImage(im, c.face < 0 ? -cx - cw : cx, cy, cw, ch); }
    else { ctx.fillStyle = '#efe8ff'; ctx.fillRect(cx, cy, cw, ch); }
    ctx.restore();
    if (c.owned) {
      // a holder's Chog wears a crown
      ctx.font = `${s * .5}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('👑', cx + cw - s * .08, cy + s * .08);
    }
    if (hover === c.id || c.mine) {
      ctx.strokeStyle = c.mine ? ROSE : ROYAL; ctx.lineWidth = Math.max(2, s * .07);
      rr(ctx, cx - s * .07, cy - s * .07, cw + s * .14, ch + s * .14, s * .2); ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    const top = y - bob - s * .27 - ch;
    hits.push({ id: c.id, x: x - s * .6, y: top, w: s * 1.2, h: s * 1.35 });
    if (c.bubble) bubbles.push({ c, x, y: top - 4, s });
    if (hover === c.id && !c.bubble) bubbles.push({ c, x, y: top - 4, s, tag: true });
  }
  if (sim.debug) {
    ctx.font = '700 11px system-ui'; ctx.fillStyle = '#e0245e';
    for (const n of NODES) { const [nx, ny] = n[which]; ctx.beginPath(); ctx.arc(nx * W, ny * H, 4, 0, 7); ctx.fill(); ctx.fillText(n.id, nx * W + 6, ny * H - 6); }
  }
  // bubbles on top of everyone
  const placed = [];
  for (const b of bubbles) bubble(ctx, b, now, W, placed);
  return hits;
}

function bubble(ctx, { c, x, y, s, tag }, now, W, placed) {
  const fs = Math.max(12, Math.min(15, s * .36));
  const text = tag ? `${c.name} #${c.id}` : c.bubble.text;
  const age = tag ? 1 : now - c.bubble.t0, left = tag ? 1 : c.bubble.until - now;
  const a = Math.max(0, Math.min(1, age / .18, left / .3));
  if (a <= 0) return;
  const pop = tag ? 1 : .85 + .15 * Math.min(1, age / .18) + (age < .3 ? Math.sin(age / .3 * Math.PI) * .06 : 0);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = `${tag ? 700 : 800} ${fs}px Nunito, system-ui, sans-serif`;
  const lines = wrap(ctx, text, tag ? 400 : fs * 15);
  const lw = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const pad = fs * .7, bw = lw + pad * 2, bh = lines.length * fs * 1.25 + pad * 1.3;
  let bx = x - bw / 2; bx = Math.max(6, Math.min(W - bw - 6, bx));
  let by = y - bh - fs * .6;
  // never stack bubbles on top of each other: lift this one above any it would cover
  for (let k = 0; k < 6; k++) {
    const hit = placed.find((q) => bx < q.x + q.w + 4 && bx + bw + 4 > q.x && by < q.y + q.h + 4 && by + bh + 4 > q.y);
    if (!hit) break; by = hit.y - bh - 6;
  }
  placed.push({ x: bx, y: by, w: bw, h: bh });
  ctx.translate(x, y); ctx.scale(pop, pop); ctx.translate(-x, -y);
  ctx.shadowColor = 'rgba(43,27,90,.22)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;
  ctx.fillStyle = tag ? INK : '#fff';
  rr(ctx, bx, by, bw, bh, Math.min(16, bh / 2)); ctx.fill();
  const tx = Math.max(bx + fs, Math.min(bx + bw - fs, x));
  ctx.beginPath(); ctx.moveTo(tx - fs * .45, by + bh - 1); ctx.lineTo(x, Math.max(y, by + bh + fs * .6)); ctx.lineTo(tx + fs * .45, by + bh - 1); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = tag ? '#fff' : INK; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
  const mid = bx + bw / 2;
  lines.forEach((l, i) => ctx.fillText(l, mid, by + pad * .65 + i * fs * 1.25));
  if (!tag && c.bubble.emote) {
    ctx.font = `${fs * 1.3}px system-ui`; ctx.fillText(c.bubble.emote, bx + bw - fs * .2, by - fs * .7);
  }
  ctx.restore();
}
