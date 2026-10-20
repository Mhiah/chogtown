/* eslint-disable */
// @ts-nocheck
/*
 * The island's walkable graph. Positions are fractions of each render (see Diorama.tsx), so the same
 * simulation draws correctly on the wide desktop art and the tall phone art.
 * Each node: id, [x, y] on the wide art, [x, y] on the tall art, and what's there.
 */
export const NODES = [
  // fountain plaza ring (Chogmate)
  { id: 'fN', w: [0.704,0.476], t: [0.5,0.584], place: 'home' },
  { id: 'fE', w: [0.811,0.579], t: [0.657,0.633], place: 'home' },
  { id: 'fS', w: [0.704,0.691], t: [0.5,0.675], place: 'home' },
  { id: 'fW', w: [0.596,0.579], t: [0.343,0.633], place: 'home' },
  // spokes out of the plaza
  { id: 'fNE', w: [0.78,0.502], t: [0.611,0.604] },
  { id: 'fSE', w: [0.78,0.658], t: [0.611,0.662] },
  { id: 'fSW', w: [0.628,0.658], t: [0.389,0.662] },
  { id: 'fNW', w: [0.628,0.502], t: [0.389,0.604] },
  { id: 'pA', w: [0.643,0.499], t: [0.5,0.56] },
  { id: 'pT', w: [0.771,0.493], t: [0.708,0.575] },
  { id: 'pB', w: [0.829,0.64], t: [0.612,0.706] },
  { id: 'pP', w: [0.638,0.67], t: [0.357,0.706] },
  { id: 'pS', w: [0.83,0.712], t: [0.5,0.74] },
  // places
  { id: 'arena', w: [0.575,0.493], t: [0.5,0.535], place: 'arena' },
  { id: 'tower', w: [0.814,0.423], t: [0.77,0.54], place: 'feed' },
  { id: 'kiosk', w: [0.868,0.48], t: [0.86,0.575], place: 'feed' },
  { id: 'shop', w: [0.882,0.691], t: [0.671,0.778], place: 'shop' },
  { id: 'palace', w: [0.557,0.768], t: [0.167,0.77], place: 'hall' },
  { id: 'lawnS', w: [0.857,0.768], t: [0.5,0.825] },
  { id: 'lawnW', w: [0.649,0.62], t: [0.284,0.568] },
];
export const EDGES = [
  ['fN', 'fNE'], ['fNE', 'fE'], ['fE', 'fSE'], ['fSE', 'fS'], ['fS', 'fSW'], ['fSW', 'fW'], ['fW', 'fNW'], ['fNW', 'fN'],
  ['fN', 'pA'], ['pA', 'arena'], ['fN', 'pT'], ['fE', 'pT'], ['pT', 'tower'], ['pT', 'kiosk'],
  ['fE', 'pB'], ['pB', 'shop'], ['fS', 'pS'], ['pS', 'lawnS'], ['pB', 'lawnS'],
  ['fW', 'pP'], ['pP', 'palace'], ['fW', 'lawnW'], ['pA', 'lawnW'], ['fS', 'pP'],
];
export const NODE = Object.fromEntries(NODES.map((n) => [n.id, n]));
export const ADJ = Object.fromEntries(NODES.map((n) => [n.id, []]));
for (const [a, b] of EDGES) { ADJ[a].push(b); ADJ[b].push(a); }
export const PLACE_NODE = { home: 'fS', arena: 'arena', feed: 'kiosk', shop: 'shop', hall: 'palace' };

/** Breadth-first shortest path between two nodes (the graph is tiny). */
export function route(from, to) {
  if (from === to) return [from];
  const prev = { [from]: null }, q = [from];
  while (q.length) { const n = q.shift(); for (const m of ADJ[n]) if (!(m in prev)) { prev[m] = n; if (m === to) { const p = [to]; let k = to; while (prev[k]) { k = prev[k]; p.unshift(k); } return p; } q.push(m); } }
  return [from];
}
