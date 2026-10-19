// UI-Klänge, komplett per Web Audio synthetisiert (keine Original-Sounds).

import { prefs, bus } from './store.js';

let ctx = null;
let master = null;
let reverb = null;
let lastMove = 0;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = prefs.get('volume');
  master.connect(ctx.destination);

  // Kleiner Hall aus generierter Impulsantwort
  reverb = ctx.createConvolver();
  const len = ctx.sampleRate * 2.2;
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  reverb.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  reverb.connect(wet).connect(master);
  return ctx;
}

bus.on('prefs', ({ key, value }) => {
  if (key === 'volume' && master) master.gain.setTargetAtTime(value, ctx.currentTime, 0.05);
});

export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}

export function audioContext() {
  return ensure();
}

export function masterNode() {
  ensure();
  return master;
}

export function reverbNode() {
  ensure();
  return reverb;
}

function tone({ freq, to, type = 'sine', at = 0, dur = 0.12, gain = 0.12, attack = 0.005, wet = false, detune = 0 }) {
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.detune.value = detune;
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  if (wet) g.connect(reverb);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise({ at = 0, dur = 0.3, gain = 0.08, from = 400, to = 2400, q = 1.2, wet = true }) {
  const t = ctx.currentTime + at;
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(from, t);
  bp.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(master);
  if (wet) g.connect(reverb);
  src.start(t);
}

const SOUNDS = {
  move() {
    tone({ freq: 1250, to: 980, type: 'triangle', dur: 0.06, gain: 0.05 });
  },
  select() {
    tone({ freq: 880, type: 'sine', dur: 0.09, gain: 0.08 });
    tone({ freq: 1320, type: 'sine', at: 0.045, dur: 0.14, gain: 0.07, wet: true });
  },
  back() {
    tone({ freq: 720, to: 520, type: 'sine', dur: 0.12, gain: 0.07 });
  },
  open() {
    noise({ dur: 0.32, gain: 0.05, from: 300, to: 2600 });
    tone({ freq: 660, to: 990, type: 'sine', dur: 0.25, gain: 0.04, wet: true });
  },
  close() {
    noise({ dur: 0.26, gain: 0.04, from: 2200, to: 300 });
  },
  toggle() {
    tone({ freq: 1500, type: 'square', dur: 0.03, gain: 0.025 });
  },
  type() {
    tone({ freq: 2200, type: 'triangle', dur: 0.025, gain: 0.018 });
  },
  notify() {
    tone({ freq: 1318.5, type: 'sine', dur: 0.5, gain: 0.07, wet: true });
    tone({ freq: 1975.5, type: 'sine', at: 0.11, dur: 0.7, gain: 0.06, wet: true });
  },
  error() {
    tone({ freq: 220, type: 'triangle', dur: 0.12, gain: 0.1 });
    tone({ freq: 196, type: 'triangle', at: 0.14, dur: 0.18, gain: 0.1 });
  },
  achievement() {
    tone({ freq: 70, to: 45, type: 'sine', dur: 0.6, gain: 0.25 });
    [1046.5, 1568, 2093, 2637].forEach((f, i) =>
      tone({ freq: f, type: 'sine', at: 0.05 + i * 0.07, dur: 0.9, gain: 0.06, wet: true }),
    );
    noise({ at: 0.05, dur: 0.6, gain: 0.03, from: 4000, to: 9000, q: 0.7 });
  },
  power() {
    tone({ freq: 140, to: 70, type: 'sine', dur: 0.35, gain: 0.2 });
    tone({ freq: 2400, type: 'sine', dur: 0.08, gain: 0.04 });
  },
  launch() {
    noise({ dur: 1.2, gain: 0.06, from: 200, to: 5000, q: 0.8 });
    tone({ freq: 110, to: 220, type: 'sine', dur: 1.2, gain: 0.08, wet: true });
  },
};

export function play(name) {
  if (!prefs.get('sounds')) return;
  if (!ensure() || ctx.state !== 'running') return;
  if (name === 'move') {
    const now = performance.now();
    if (now - lastMove < 45) return;
    lastMove = now;
  }
  SOUNDS[name]?.();
}

// Startklang: anschwellende Fläche, Funkenregen, eigene Vier-Ton-Melodie.
export function playBoot({ burstAt = 2.6 } = {}) {
  if (!prefs.get('sounds') || !ensure()) return;
  const t0 = ctx.currentTime + 0.05;

  const pad = ctx.createGain();
  pad.gain.setValueAtTime(0.0001, t0);
  pad.gain.exponentialRampToValueAtTime(0.09, t0 + burstAt * 0.85);
  pad.gain.exponentialRampToValueAtTime(0.03, t0 + burstAt + 0.6);
  pad.gain.exponentialRampToValueAtTime(0.0001, t0 + burstAt + 4.5);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(300, t0);
  lp.frequency.exponentialRampToValueAtTime(3200, t0 + burstAt);
  lp.frequency.exponentialRampToValueAtTime(900, t0 + burstAt + 3);
  pad.connect(lp).connect(master);
  lp.connect(reverb);
  for (const [f, d] of [
    [130.81, -7],
    [196, 6],
    [261.63, -4],
    [329.63, 5],
    [392, 0],
  ]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = d;
    o.connect(pad);
    o.start(t0);
    o.stop(t0 + burstAt + 4.6);
  }

  const at = (s) => s;
  noise({ at: at(burstAt - 0.9), dur: 1.1, gain: 0.07, from: 300, to: 6000, q: 0.6 });
  tone({ freq: 55, to: 40, type: 'sine', at: at(burstAt), dur: 1.4, gain: 0.3 });
  noise({ at: at(burstAt), dur: 1.8, gain: 0.05, from: 8000, to: 1500, q: 0.5 });

  // Eigene Melodie (nicht von einer Konsole übernommen)
  const melody = [
    [659.25, 0.55],
    [987.77, 0.8],
    [1479.98, 1.05],
    [1318.51, 1.45],
  ];
  for (const [f, off] of melody) {
    tone({ freq: f, type: 'sine', at: burstAt + off, dur: 2.2, gain: 0.07, attack: 0.02, wet: true });
    tone({ freq: f * 2, type: 'sine', at: burstAt + off, dur: 1.2, gain: 0.015, attack: 0.02, wet: true });
  }
}
