/* eslint-disable */
// @ts-nocheck
/* Rumble sound: a tiny WebAudio synth, no files. */
let ac = null, master = null, muted = false;
try { muted = localStorage.getItem('chogtown:mute') === '1'; } catch {}

export function unlock(){
  if (ac){ if (ac.state === 'suspended') ac.resume(); return; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  master = ac.createGain(); master.gain.value = muted ? 0 : .45; master.connect(ac.destination);
}
export function setMuted(m){ muted = m; try { localStorage.setItem('chogtown:mute', m ? '1' : '0'); } catch {} if (master) master.gain.value = m ? 0 : .45; }
export const isMuted = () => muted;

function tone(f0, f1, dur, type = 'square', vol = .2, delay = 0){
  if (!ac) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02);
}
function noise(dur, vol = .3, freq = 800, delay = 0, q = .8, type = 'lowpass'){
  if (!ac) return;
  const t = ac.currentTime + delay, n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = buf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t);
}

export const sfx = {
  laser: () => { tone(1600, 300, .18, 'sawtooth', .09); tone(2400, 900, .12, 'square', .04); },
  spit: () => { noise(.08, .18, 2600, 0, 1, 'bandpass'); tone(500, 260, .07, 'triangle', .1); },
  tears: () => [0, .03, .06].forEach(d => tone(900, 1500, .06, 'sine', .07, d)),
  heart: () => tone(660, 990, .14, 'triangle', .1),
  bolt: () => tone(1200, 700, .06, 'square', .06),
  stare: () => tone(180, 90, .4, 'sine', .18),
  hit: (k = 1) => { tone(220 / k, 70, .14, 'square', .14); noise(.09, .25 * k, 1400); },
  big: () => { tone(140, 40, .3, 'sawtooth', .2); noise(.25, .45, 900); },
  puke: () => { noise(.9, .22, 600, 0, 3, 'bandpass'); tone(300, 120, .8, 'sawtooth', .05); },
  bubble: () => [0, .05].forEach(d => tone(420, 900, .12, 'sine', .14, d)),
  pop: () => { tone(1200, 200, .08, 'square', .12); noise(.06, .2, 3000); },
  drool: () => tone(260, 120, .3, 'sine', .14),
  coins: () => [0, .04, .08, .12].forEach(d => tone(1900, 2400, .05, 'square', .05, d)),
  honk: () => { tone(330, 300, .35, 'sawtooth', .22); tone(415, 380, .35, 'sawtooth', .15); },
  chomp: () => { noise(.1, .4, 700); tone(160, 80, .12, 'square', .2); },
  wail: () => tone(520, 260, .7, 'triangle', .14),
  grin: () => [523, 659, 784].forEach((f, i) => tone(f, f, .12, 'triangle', .1, i * .06)),
  dash: () => noise(.16, .25, 1800, 0, 1.4, 'bandpass'),
  quack: () => { tone(500, 380, .12, 'sawtooth', .2); tone(470, 360, .14, 'sawtooth', .2, .14); },
  frog: () => { tone(200, 120, .1, 'square', .2); tone(240, 140, .1, 'square', .2, .12); },
  ringout: () => { tone(700, 60, .9, 'sawtooth', .16); noise(1.2, .3, 500, .2); },
  crowd: (v = .3) => { noise(1.3, v, 1100, 0, .5); noise(1.0, v * .6, 2400, .1, .6, 'bandpass'); },
  count: () => tone(880, 880, .12, 'square', .1),
  go: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, f, .14, 'square', .1, i * .05)),
  win: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, f * 1.01, .2, 'triangle', .14, i * .1)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, f * .98, .28, 'triangle', .14, i * .16)),
};
