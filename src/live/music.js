/* eslint-disable */
// @ts-nocheck
/*
 * The town's music box: a little procedural loop in the browser, no files. Pentatonic and toy-like by day,
 * slower, lower and softer at night. Plays through the same audio graph and mute switch as the Rumble.
 */
import { audio, isMuted, unlock } from '../arena/sfx';

const DAY = [0, 2, 4, 7, 9, 12, 14, 16], NIGHT = [0, 3, 5, 7, 10, 12, 15];
// four bars of melody steps (indexes into the scale, -1 = rest), repeated with small variations
const TUNE = [0, 2, 4, 5, 4, 2, 3, -1, 1, 3, 5, 6, 5, 3, 4, -1, 0, 2, 4, 7, 6, 4, 5, -1, 3, 2, 1, 2, 0, -1, -1, -1];
let timer = null, step = 0, nextAt = 0, night = 0;

function note(ac, out, freq, t, vol, len) {
  const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine'; o2.type = 'triangle';
  o.frequency.value = freq; o2.frequency.value = freq * 2;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + len);
  const g2 = ac.createGain(); g2.gain.value = .18;
  o.connect(g); o2.connect(g2); g2.connect(g); g.connect(out);
  o.start(t); o2.start(t); o.stop(t + len + .05); o2.stop(t + len + .05);
}

function tick() {
  const a = audio(); if (!a) return;
  const { ac, master } = a;
  const bpm = night > .5 ? 72 : 96, beat = 60 / bpm / 2; // eighth notes
  while (nextAt < ac.currentTime + .25) {
    if (!isMuted()) {
      const scale = night > .5 ? NIGHT : DAY, base = night > .5 ? 196 : 523.25; // G3 at night, C5 by day
      const i = TUNE[step % TUNE.length];
      const vary = (Math.floor(step / TUNE.length) % 2) && step % 8 === 6 ? 1 : 0;
      if (i >= 0) note(ac, master, base * Math.pow(2, scale[(i + vary) % scale.length] / 12), nextAt, night > .5 ? .035 : .045, night > .5 ? 2.2 : 1.3);
      // a soft bass note on each bar
      if (step % 8 === 0) note(ac, master, (night > .5 ? 98 : 130.8) * Math.pow(2, [0, 5, 7, 3][(step / 8) % 4 | 0] / 12), nextAt, .03, 2.4);
    }
    step++; nextAt += beat;
  }
}

/** Start the music box (call from a click, so the browser allows sound). */
export function startMusic() {
  unlock();
  const a = audio(); if (!a || timer) return;
  nextAt = a.ac.currentTime + .1;
  timer = setInterval(tick, 100);
}
export function setNight(n) { night = n; }
export function stopMusic() { clearInterval(timer); timer = null; }
