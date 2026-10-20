// @ts-nocheck
/*
 * Chog Island's life sim. A small crowd is out on the island at any time; everyone else is indoors at one of
 * the places and comes out in turns. Chogs walk the paths, stand in fixed spots, and talk two at a time,
 * one line on screen per pair. Pure and seedable: the same seed and cast play out the same, so the server can
 * run it and every viewer can replay it. Time is in seconds.
 */
import { NODE, NODES, PLACE_NODE, route } from './map.js';
import { LINES, EMOTE } from './lines.js';

const SPEED = 0.026;          // art widths per second along a path
const LINE_S = 3.2;           // how long a line stays up before the reply
const MAX_TALKS = 2;          // conversations at once, so the island reads
const STAGE = 18;             // Chogs out on the island at once
// doors: places a Chog can go inside (and come back out of)
export const DOORS = { arena: 'arena', kiosk: 'feed', tower: 'feed', shop: 'shop', palace: 'hall' };
// where Chogs stand on a node, in art widths: up to 3 per node, never on top of each other
const SLOTS = [[0, 0], [-.024, .01], [.024, .01]];
const GOALS = [['arena', 3], ['kiosk', 2], ['shop', 2], ['palace', 2], ['tower', 1], ['fS', 2], ['fN', 1], ['fE', 1], ['fW', 1],
  ['fNE', 1], ['fSE', 1], ['fSW', 1], ['fNW', 1], ['lawnS', 2], ['lawnW', 2], ['pT', 1], ['pB', 1], ['pS', 1]];

export const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (r, a) => a[Math.floor(r() * a.length)];
function weighted(r, list) {
  let total = 0; for (const [, w] of list) total += w;
  let x = r() * total; for (const [v, w] of list) { if ((x -= w) < 0) return v; } return list[0][0];
}
const dist = (a, b) => Math.hypot(NODE[a].w[0] - NODE[b].w[0], NODE[a].w[1] - NODE[b].w[1]);

/**
 * cast: [{ id, name, archetype, rel?: { [otherId]: 'friend' | 'rival' } }]
 * Returns a sim you step with sim.step(dt) and read with sim.chogs / sim.inside / sim.events.
 */
export function createSim(cast, { seed = 1969 } = {}) {
  const r = rng(seed);
  const doors = Object.keys(DOORS);
  const chogs = cast.map((c) => ({
    ...c, at: pick(r, doors), slot: -1, path: null, leg: 0, legT: 0,
    out: false, fade: 0, idle: 0, home: 0, talkCool: 4 + r() * 10,
    lane: (r() - .5) * .008, bubble: null, face: r() < .5 ? -1 : 1, walking: false, talking: false,
  }));
  const byId = Object.fromEntries(chogs.map((c) => [c.id, c]));
  let t = 0;
  const talks = [];  // live conversations: { a, b, lines: [{ by, text, emote }], i, next }
  const events = []; // { t, kind, a, b } — the log the town and the AI build on
  const held = {};   // node -> [chog in slot 0, 1, 2]

  // slots: a Chog books a spot at its destination before it leaves, so nobody piles up
  function freeSlot(node) { const h = held[node] || []; for (let i = 0; i < SLOTS.length; i++) if (!h[i]) return i; return -1; }
  function book(c, node) { const i = freeSlot(node); if (i < 0) return false; unbook(c); (held[node] ||= [])[i] = c; c.slot = i; c.dest = node; return true; }
  function unbook(c) { if (c.dest && held[c.dest]?.[c.slot] === c) held[c.dest][c.slot] = null; c.slot = -1; c.dest = null; }

  function relOf(a, b) { return a.rel?.[b.id] || b.rel?.[a.id] || null; }
  const recent = [];
  function lineFor(a, b, kind) {
    const bank = (LINES[a.archetype] || LINES.hype)[kind];
    let line = pick(r, bank);
    for (let i = 0; i < 4 && recent.includes(line); i++) line = pick(r, bank);
    recent.push(line); if (recent.length > 14) recent.shift();
    return line.replace('{o}', b.name);
  }

  function goWalk(c, to) {
    if (to === c.at || !book(c, to)) return false;
    const p = route(c.at, to);
    if (!p || p.length < 2) { unbook(c); return false; }
    c.path = p; c.leg = 0; c.legT = 0; c.walking = true;
    return true;
  }
  function goal(c) {
    // often walk up to someone standing on their own: that's how conversations start
    if (c.out && r() < .45) {
      const lone = chogs.filter((o) => o !== c && o.out && !o.walking && !o.talking && !o.leaving && o.at !== c.at && freeSlot(o.at) >= 0 && (held[o.at] || []).filter(Boolean).length === 1);
      if (lone.length) return pick(r, lone).at;
    }
    for (let k = 0; k < 6; k++) {
      const to = weighted(r, GOALS);
      if (to !== c.at && freeSlot(to) >= 0) return to;
    }
    return null;
  }

  const onStage = () => { let n = 0; for (const c of chogs) if (c.out) n++; return n; };

  /** Two Chogs at the same spot talk: a line, a reply, sometimes a comeback. */
  function meet(a, b) {
    const rel = relOf(a, b);
    const kind = rel === 'rival' ? 'rival' : rel === 'friend' ? 'friend' : 'hi';
    const lines = [{ by: a, text: lineFor(a, b, kind), emote: EMOTE[kind] }, { by: b, text: lineFor(b, a, 'reply'), emote: '' }];
    if (kind === 'rival' && r() < .6) lines.push({ by: a, text: lineFor(a, b, 'rival'), emote: '😤' });
    talks.push({ a, b, lines, i: -1, next: t });
    a.talking = b.talking = true;
    const ax = NODE[a.at].w[0] + SLOTS[a.slot][0], bx = NODE[b.at].w[0] + SLOTS[b.slot][0];
    a.face = bx >= ax ? 1 : -1; b.face = -a.face;
    events.push({ t, kind, a: a.id, b: b.id });
    if (events.length > 200) events.shift();
  }

  function step(dt) {
    t += dt;
    // conversations advance one line at a time
    for (let i = talks.length - 1; i >= 0; i--) {
      const k = talks[i]; if (k.next > t) continue;
      if (k.i >= 0) k.lines[k.i].by.bubble = null;
      k.i++;
      if (k.i >= k.lines.length) {
        talks.splice(i, 1);
        for (const c of [k.a, k.b]) { c.talking = false; c.talkCool = 25 + r() * 25; c.idle = Math.min(c.idle, 1.5 + r() * 3); }
        continue;
      }
      const L = k.lines[k.i];
      L.by.bubble = { text: L.text, emote: L.emote, t0: t, until: t + LINE_S };
      k.next = t + LINE_S + .25;
    }

    for (const c of chogs) {
      c.talkCool -= dt;
      c.fade = Math.max(0, Math.min(1, c.fade + (c.out && !c.leaving ? dt : -dt) * 2.5));
      if (!c.out) {
        // indoors: come out when there's room on the island
        c.home -= dt;
        if (c.home <= 0 && onStage() < STAGE) {
          const to = goal(c);
          if (to && goWalk(c, to)) { c.out = true; c.fade = 0; }
          else c.home = 2 + r() * 4;
        }
        continue;
      }
      if (c.leaving) { if (c.fade <= 0) { c.out = false; c.leaving = false; c.home = 20 + r() * 50; unbook(c); } continue; }
      if (c.walking) {
        const from = c.path[c.leg], to = c.path[c.leg + 1];
        c.legT += dt * SPEED / Math.max(.004, dist(from, to));
        c.face = NODE[to].w[0] >= NODE[from].w[0] ? 1 : -1;
        if (c.legT >= 1) {
          c.leg++; c.legT = 0; c.at = to;
          if (c.leg >= c.path.length - 1) { c.walking = false; c.path = null; c.idle = 6 + r() * 12; }
        }
        continue;
      }
      if (c.talking) continue;
      c.idle -= dt;
      if (c.idle <= 0) {
        // at a door, sometimes head inside; otherwise wander on
        if (DOORS[c.at] && r() < .45) { c.leaving = true; continue; }
        const to = goal(c);
        if (!to || !goWalk(c, to)) c.idle = 2 + r() * 4;
      }
    }

    // encounters: two Chogs standing at the same spot, not busy, both up for a chat
    if (talks.length < MAX_TALKS && r() < dt * .8) {
      const free = chogs.filter((c) => c.out && !c.leaving && !c.walking && !c.talking && c.talkCool <= 0 && c.fade >= 1);
      for (const a of free) {
        const b = free.find((x) => x !== a && x.at === a.at);
        if (b) { meet(a, b); break; }
      }
    }
  }

  /** Where a Chog stands, as a fraction of the art. which: 'w' (wide render) or 't' (tall render). */
  function where(c, which = 'w') {
    const kx = which === 't' ? 2.1 : 1, ky = which === 't' ? .55 : 1;
    if (c.walking) {
      const A = NODE[c.path[c.leg]][which], B = NODE[c.path[c.leg + 1]][which], e = c.legT;
      const last = c.leg === c.path.length - 2, s = last && c.slot >= 0 ? SLOTS[c.slot] : [0, 0];
      // walk in a lane, and drift into the booked spot on the last stretch
      return { x: A[0] + (B[0] - A[0]) * e + (s[0] * e + c.lane) * kx, y: A[1] + (B[1] - A[1]) * e + s[1] * e * ky };
    }
    const [x, y] = NODE[c.at][which], s = c.slot >= 0 && c.dest === c.at ? SLOTS[c.slot] : [0, 0];
    return { x: x + s[0] * kx, y: y + s[1] * ky };
  }

  /** How many Chogs are inside each place right now. */
  function inside() {
    const n = { arena: 0, feed: 0, shop: 0, hall: 0 };
    for (const c of chogs) if (!c.out) n[DOORS[c.at]]++;
    return n;
  }

  /** Send a Chog somewhere now (players, Main Event bells). */
  function send(id, place) {
    const c = byId[id]; if (!c) return;
    const to = PLACE_NODE[place] || place;
    if (c.walking) { c.at = c.legT > .5 ? c.path[c.leg + 1] : c.path[c.leg]; c.walking = false; }
    c.out = true; c.leaving = false;
    goWalk(c, to);
  }

  // open with a few Chogs already out, so the island is never empty
  for (const c of chogs.slice(0, STAGE - 4)) {
    const to = goal(c);
    if (to && book(c, to)) { c.at = to; c.out = true; c.fade = 1; c.idle = r() * 8; }
  }
  for (const c of chogs) if (!c.out) c.home = r() * 30;

  return { chogs, byId, events, step, where, send, inside, get t() { return t; } };
}
