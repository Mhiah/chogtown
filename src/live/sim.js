// @ts-nocheck
/*
 * Chog Island's life sim. Chogs walk the island's paths, loiter at places, bump into each other and talk.
 * Pure and seedable: the same seed and the same cast play out the same, so the server can run it and every
 * viewer can replay it. Time is in seconds.
 */
import { NODE, ADJ, NODES, PLACE_NODE, route } from './map.js';
import { LINES, EMOTE } from './lines.js';

const SPEED = 0.034;          // art widths per second along a path
const TALK_GAP = 1.9;         // seconds between a line and its reply
const BUBBLE_S = 3.6;
const MAX_TALKS = 4;          // conversations on screen at once, so the island reads
const GOALS = [['arena', 3], ['kiosk', 2], ['shop', 2], ['palace', 2], ['fS', 2], ['fN', 1], ['fE', 1], ['fW', 1], ['fNE', 1], ['fSE', 1], ['fSW', 1], ['fNW', 1], ['lawnS', 2], ['lawnW', 2], ['tower', 1]];

export const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (r, a) => a[Math.floor(r() * a.length)];
function weighted(r, list) {
  let total = 0; for (const [, w] of list) total += w;
  let x = r() * total; for (const [v, w] of list) { if ((x -= w) < 0) return v; } return list[0][0];
}
const dist = (a, b) => Math.hypot(NODE[a].w[0] - NODE[b].w[0], NODE[a].w[1] - NODE[b].w[1]);

/**
 * cast: [{ id, name, archetype, rel?: { [otherId]: 'friend' | 'rival' } }]
 * Returns a sim you step with sim.step(dt) and read with sim.chogs / sim.events.
 */
export function createSim(cast, { seed = 1969 } = {}) {
  const r = rng(seed);
  const nodes = NODES.map((n) => n.id);
  const chogs = cast.map((c, i) => ({
    ...c,
    at: nodes[i % nodes.length], path: null, leg: 0, legT: 0,
    idle: r() * 6,                            // seconds left loitering
    talkCool: 2 + r() * 8,
    jx: (r() - .5) * .03, jy: (r() - .5) * .02, // where on a node it likes to stand
    bubble: null, face: r() < .5 ? -1 : 1, walking: false, slot: i,
  }));
  const byId = Object.fromEntries(chogs.map((c) => [c.id, c]));
  let t = 0;
  const talks = [];  // pending replies
  const events = []; // { t, kind, a, b, text } — the log the town and the AI build on

  function relOf(a, b) { return a.rel?.[b.id] || (b.rel?.[a.id]) || null; }

  function say(c, text, emote = '') {
    c.bubble = { text, emote, t0: t, until: t + BUBBLE_S };
  }

  const recent = [];
  function lineFor(a, b, kind) {
    const bank = (LINES[a.archetype] || LINES.hype)[kind];
    let line = pick(r, bank);
    for (let i = 0; i < 4 && recent.includes(line); i++) line = pick(r, bank);
    recent.push(line); if (recent.length > 12) recent.shift();
    return line.replace('{o}', b.name);
  }

  // places get picked less the busier they are, so the island spreads out
  function crowd(id) { let n = 0; for (const c of chogs) if ((c.walking ? c.path[c.path.length - 1] : c.at) === id) n++; return n; }
  function goal() { return weighted(r, GOALS.map(([id, w]) => [id, w / (1 + crowd(id) * .6)])); }

  function goWalk(c, to) {
    const p = route(c.at, to);
    if (!p || p.length < 2) return false;
    c.path = p; c.leg = 0; c.legT = 0; c.walking = true;
    return true;
  }

  function meet(a, b) {
    const rel = relOf(a, b);
    const kind = rel === 'rival' ? 'rival' : rel === 'friend' ? 'friend' : 'hi';
    say(a, lineFor(a, b, kind), EMOTE[kind]);
    a.face = NODE[b.at].w[0] + b.jx >= NODE[a.at].w[0] + a.jx ? 1 : -1; b.face = -a.face;
    talks.push({ at: t + TALK_GAP, a: b, b: a, kind: 'reply' });
    a.talkCool = b.talkCool = 14 + r() * 16;
    a.idle = Math.max(a.idle, TALK_GAP + BUBBLE_S + .5); b.idle = Math.max(b.idle, TALK_GAP + BUBBLE_S + .5);
    events.push({ t, kind, a: a.id, b: b.id });
    if (events.length > 200) events.shift();
  }

  function activeTalks() { let n = 0; for (const c of chogs) if (c.bubble && c.bubble.until > t) n++; return n; }

  function step(dt) {
    t += dt;
    for (let i = talks.length - 1; i >= 0; i--) {
      const k = talks[i]; if (k.at > t) continue;
      talks.splice(i, 1);
      if (!k.a.walking) say(k.a, lineFor(k.a, k.b, k.kind), '');
    }
    for (const c of chogs) {
      c.talkCool -= dt;
      if (c.bubble && c.bubble.until < t) c.bubble = null;
      if (c.walking) {
        const from = c.path[c.leg], to = c.path[c.leg + 1];
        c.legT += dt * SPEED / Math.max(.004, dist(from, to));
        c.face = NODE[to].w[0] >= NODE[from].w[0] ? 1 : -1;
        if (c.legT >= 1) {
          c.leg++; c.legT = 0; c.at = to;
          if (c.leg >= c.path.length - 1) { c.walking = false; c.path = null; c.idle = 4 + r() * 10; }
        }
        continue;
      }
      c.idle -= dt;
      if (c.idle <= 0) {
        // mostly wander to a place, sometimes just to the next node over
        const to = r() < .7 ? goal() : pick(r, ADJ[c.at]);
        if (!goWalk(c, to)) c.idle = 2 + r() * 4;
      }
    }
    // encounters: two loitering Chogs at the same or neighbouring node
    if (activeTalks() < MAX_TALKS * 2) {
      const still = chogs.filter((c) => !c.walking && c.talkCool <= 0 && !c.bubble);
      for (let i = 0; i < still.length; i++) {
        const a = still[i]; if (a.bubble) continue;
        const b = still.find((x) => x !== a && !x.bubble && (x.at === a.at || ADJ[a.at].includes(x.at) && r() < .3));
        if (b && r() < dt * 1.6) { meet(a, b); if (activeTalks() >= MAX_TALKS * 2) break; }
      }
    }
  }

  /** Where a Chog stands, as a fraction of the art. which: 'w' (wide render) or 't' (tall render). */
  function where(c, which = 'w') {
    let x, y;
    if (c.walking) {
      const A = NODE[c.path[c.leg]][which], B = NODE[c.path[c.leg + 1]][which];
      const e = c.legT;
      x = A[0] + (B[0] - A[0]) * e; y = A[1] + (B[1] - A[1]) * e;
    } else { [x, y] = NODE[c.at][which]; }
    const k = which === 't' ? 2.1 : 1;
    return { x: x + c.jx * k, y: y + c.jy * (which === 't' ? 1.2 : 1) };
  }

  /** Send a Chog somewhere now (players, Main Event bells). */
  function send(id, place) {
    const c = byId[id]; if (!c) return;
    const to = PLACE_NODE[place] || place;
    if (c.walking) { c.at = c.legT > .5 ? c.path[c.leg + 1] : c.path[c.leg]; c.walking = false; }
    goWalk(c, to);
  }

  return { chogs, byId, events, step, where, send, say: (id, text, emote) => byId[id] && say(byId[id], text, emote), get t() { return t; } };
}
