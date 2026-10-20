/* eslint-disable */
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
const SCENE_SLOT = [0, .024]; // a fourth spot, only for a player walking up to someone
// where the crowd stands when the Main Event bell rings
export const RALLY = ['arena', 'pA', 'fN', 'fNW', 'fNE', 'lawnW', 'pT', 'fW'];
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
export function createSim(cast, { seed = 1969, follow = false } = {}) {
  const r = rng(seed);
  const doors = Object.keys(DOORS);
  const fresh = (c) => ({
    ...c, at: pick(r, doors), slot: -1, path: null, leg: 0, legT: 0,
    out: false, fade: 0, idle: 0, home: 0, talkCool: 4 + r() * 10,
    lane: (r() - .5) * .008, bubble: null, face: r() < .5 ? -1 : 1, walking: false, talking: false,
  });
  const chogs = cast.map(fresh);
  const byId = Object.fromEntries(chogs.map((c) => [c.id, c]));
  let rally = false;
  const scenes = []; // a player's Chog walking up to someone: { a, b, lines, onDone }
  let changed = 0;   // bumps whenever something viewers should see right away happens
  let t = 0;
  const talks = [];  // live conversations: { a, b, lines: [{ by, text, emote }], i, next }
  const events = []; // { t, kind, a, b } — the log the town and the AI build on
  const held = {};   // node -> [chog in slot 0, 1, 2]

  // slots: a Chog books a spot at its destination before it leaves, so nobody piles up
  function freeSlot(node, scene = false) { const h = held[node] || []; for (let i = 0; i < SLOTS.length + (scene ? 1 : 0); i++) if (!h[i]) return i; return -1; }
  function book(c, node, scene = false) { const i = freeSlot(node, scene); if (i < 0) return false; unbook(c); (held[node] ||= [])[i] = c; c.slot = i; c.dest = node; return true; }
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

  function goWalk(c, to, scene = false) {
    if (to === c.at && c.dest === to) return false;
    if (to === c.at) { if (!book(c, to, scene)) return false; c.walking = false; return true; }
    if (!book(c, to, scene)) return false;
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
    events.push({ t, kind, a: a.id, b: b.id }); changed++;
    if (events.length > 200) events.shift();
  }

  function step(dt) {
    if (follow) return followStep(dt);
    t += dt;
    // a player's Chog has reached who it walked up to: play the scene
    for (let i = scenes.length - 1; i >= 0; i--) {
      const sc = scenes[i], { a, b } = sc;
      if (a.walking || !sc.lines && t - sc.t0 < 15) continue;
      if (!sc.lines) sc.lines = [];
      scenes.splice(i, 1);
      if (a.at !== b.at) { b.hold = false; sc.onDone?.(); continue; }
      for (let j = talks.length - 1; j >= 0; j--) if ([talks[j].a, talks[j].b].some((x) => x === a || x === b)) { for (const L of talks[j].lines) L.by.bubble = null; talks[j].a.talking = talks[j].b.talking = false; talks.splice(j, 1); }
      const ax = NODE[a.at].w[0] + slotOf(a)[0], bx = NODE[b.at].w[0] + slotOf(b)[0];
      a.face = bx >= ax ? 1 : -1; b.face = -a.face;
      a.talking = b.talking = true;
      talks.push({ a, b, lines: sc.lines.map((L) => ({ by: L.by === 'a' ? a : b, text: L.text, emote: L.emote || '' })), i: -1, next: t, onDone: sc.onDone });
    }
    // conversations advance one line at a time
    for (let i = talks.length - 1; i >= 0; i--) {
      const k = talks[i]; if (k.next > t) continue;
      if (k.i >= 0) k.lines[k.i].by.bubble = null;
      k.i++;
      if (k.i >= k.lines.length) {
        talks.splice(i, 1); k.onDone?.(); k.b.hold = false;
        for (const c of [k.a, k.b]) { c.talking = false; c.talkCool = 25 + r() * 25; c.idle = Math.min(c.idle, 1.5 + r() * 3); }
        continue;
      }
      const L = k.lines[k.i];
      const dur = Math.max(LINE_S, Math.min(6, L.text.length / 14));
      L.by.bubble = { text: L.text, emote: L.emote, t0: t, until: t + dur };
      k.next = t + dur + .25; changed++;
    }

    for (const c of chogs) {
      c.talkCool -= dt;
      c.fade = Math.max(0, Math.min(1, c.fade + (c.out && !c.leaving ? dt : -dt) * 2.5));
      if (!c.out) {
        // indoors: come out when there's room on the island
        c.home -= dt;
        if (c.home <= 0 && onStage() < STAGE && !rally) {
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
      if (c.talking || c.player || c.hold) continue;
      if (rally) { c.face = NODE.arena.w[0] >= NODE[c.at].w[0] ? 1 : -1; continue; }
      c.idle -= dt;
      if (c.idle <= 0) {
        // at a door, sometimes head inside; otherwise wander on
        if (DOORS[c.at] && r() < .45) { c.leaving = true; continue; }
        const to = goal(c);
        if (!to || !goWalk(c, to)) c.idle = 2 + r() * 4;
      }
    }

    // encounters: two Chogs standing at the same spot, not busy, both up for a chat
    if (talks.length < MAX_TALKS && !rally && r() < dt * .8) {
      const free = chogs.filter((c) => c.out && !c.leaving && !c.walking && !c.talking && !c.player && !c.hold && c.talkCool <= 0 && c.fade >= 1);
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
      const last = c.leg === c.path.length - 2, s = last ? slotOf(c) : [0, 0];
      // walk in a lane, and drift into the booked spot on the last stretch
      return { x: A[0] + (B[0] - A[0]) * e + (s[0] * e + c.lane) * kx, y: A[1] + (B[1] - A[1]) * e + s[1] * e * ky };
    }
    const [x, y] = NODE[c.at][which], s = c.dest === c.at ? slotOf(c) : [0, 0];
    return { x: x + s[0] * kx, y: y + s[1] * ky };
  }

  function slotOf(c) { return c.slot < 0 ? [0, 0] : SLOTS[c.slot] || SCENE_SLOT; }

  /** Viewers' copy: just moves what the server said along, until the next snapshot. */
  function followStep(dt) {
    t += dt;
    for (const c of chogs) {
      c.fade = Math.max(0, Math.min(1, c.fade + (c.out && !c.leaving ? dt : -dt) * 2.5));
      if (c.bubble && c.bubble.until < t) c.bubble = null;
      if (!c.walking) continue;
      const from = c.path[c.leg], to = c.path[c.leg + 1];
      c.legT += dt * SPEED / Math.max(.004, dist(from, to));
      if (c.legT >= 1) { c.leg++; c.legT = 0; c.at = to; if (c.leg >= c.path.length - 1) { c.walking = false; c.path = null; } }
    }
  }

  /** What viewers need to draw the island: every Chog that's out, and how many are inside each place. */
  function snapshot() {
    const out = [];
    for (const c of chogs) {
      if (!c.out && c.fade <= 0) continue;
      out.push({
        id: c.id, name: c.name, archetype: c.archetype, image: c.image, at: c.at, path: c.path, leg: c.leg, legT: +c.legT.toFixed(3),
        slot: c.slot, dest: c.dest, out: c.out, fade: +c.fade.toFixed(2), leaving: !!c.leaving, face: c.face, walking: c.walking, lane: +c.lane.toFixed(4),
        player: !!c.player, bubble: c.bubble && { text: c.bubble.text, emote: c.bubble.emote, age: +(t - c.bubble.t0).toFixed(2), left: +(c.bubble.until - t).toFixed(2) },
      });
    }
    return { t: +t.toFixed(2), chogs: out, inside: inside(), rally };
  }

  /** Viewers: take the server's snapshot as the truth. */
  function load(snap) {
    t = snap.t;
    const seen = new Set();
    for (const s of snap.chogs) {
      let c = byId[s.id];
      if (!c) { c = fresh(s); chogs.push(c); byId[s.id] = c; }
      seen.add(s.id);
      Object.assign(c, s, { bubble: s.bubble && { text: s.bubble.text, emote: s.bubble.emote, t0: t - s.bubble.age, until: t + s.bubble.left } });
    }
    for (const c of chogs) if (!seen.has(c.id)) { c.out = false; c.fade = 0; c.walking = false; c.bubble = null; }
    insideCache = snap.inside; rally = snap.rally;
  }
  let insideCache = null;

  /** A new face on the island (a player's own Chog that isn't a resident). */
  function add(c) { if (byId[c.id]) return byId[c.id]; const x = fresh(c); chogs.push(x); byId[c.id] = x; return x; }

  /** A player takes control: their Chog comes out and stops wandering on its own. */
  function control(id, on = true) {
    const c = byId[id]; if (!c) return null;
    c.player = on;
    if (on && !c.out) { c.out = true; c.leaving = false; c.fade = 0; if (!goWalk(c, 'fS') && !goWalk(c, goal(c) || 'fN')) c.at = 'fS'; }
    changed++;
    return c;
  }

  /**
   * Walk a player's Chog up to another and play a scene once it gets there. lines: [{ by: 'a'|'b', text, emote }],
   * or null to start walking now and fill sc.lines in when the AI has written them.
   */
  function scene(aId, bId, lines, onDone) {
    const a = byId[aId], b = byId[bId];
    if (!a || !b || !b.out || b.leaving) return false;
    if (b.walking) { b.at = b.legT > .5 ? b.path[b.leg + 1] : b.path[b.leg]; b.walking = false; b.path = null; book(b, b.at, true) || (b.slot = -1); }
    b.hold = true;
    if (a.at !== b.at || a.dest !== b.at) {
      if (a.walking) { a.at = a.legT > .5 ? a.path[a.leg + 1] : a.path[a.leg]; a.walking = false; a.path = null; }
      if (!goWalk(a, b.at, true)) { b.hold = false; return false; }
    }
    const sc = { a, b, lines, onDone, t0: t };
    scenes.push(sc);
    changed++;
    return sc;
  }

  /** The Main Event bell: everyone out walks over to the Amphitheatre and watches. */
  function setRally(on) {
    rally = on; changed++;
    if (!on) { for (const c of chogs) c.idle = 2 + r() * 10; return; }
    for (const c of chogs) {
      if (!c.out || c.leaving || c.player || c.talking) continue;
      if (RALLY.includes(c.dest || c.at) && !c.walking) continue;
      if (c.walking) { c.at = c.legT > .5 ? c.path[c.leg + 1] : c.path[c.leg]; c.walking = false; c.path = null; }
      for (const n of RALLY) if (goWalk(c, n)) break;
    }
  }

  /** How many Chogs are inside each place right now. */
  function inside() {
    if (follow && insideCache) return insideCache;
    const n = { arena: 0, feed: 0, shop: 0, hall: 0 };
    for (const c of chogs) if (!c.out) n[DOORS[c.at]]++;
    return n;
  }

  /** Send a Chog somewhere now (players, Main Event bells). */
  function send(id, place) {
    const c = byId[id]; if (!c) return false;
    const to = PLACE_NODE[place] || place;
    if (!NODE[to]) return false;
    if (c.walking) { c.at = c.legT > .5 ? c.path[c.leg + 1] : c.path[c.leg]; c.walking = false; c.path = null; }
    c.out = true; c.leaving = false; changed++;
    return goWalk(c, to, true);
  }

  // open with a few Chogs already out, so the island is never empty
  if (!follow) for (const c of chogs.slice(0, STAGE - 4)) {
    const to = goal(c);
    if (to && book(c, to)) { c.at = to; c.out = true; c.fade = 1; c.idle = r() * 8; }
  }
  for (const c of chogs) if (!c.out) c.home = r() * 30;

  return { chogs, byId, events, step, where, send, inside, snapshot, load, add, control, scene, setRally, get rally() { return rally; }, get changed() { return changed; }, get t() { return t; } };
}
