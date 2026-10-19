// Generative Ambient-Musik (Web Audio). Jeder Sender erzeugt live eigene Musik –
// es werden keine Audiodateien verwendet.

import { audioContext, masterNode, reverbNode } from './sound.js';
import { store } from './store.js';
import { unlock } from './system.js';

export const STATIONS = [
  {
    id: 'nebula',
    title: 'Nebula Drift',
    mood: 'Schwebende Flächen',
    colors: ['#3a1c71', '#0a6cff'],
    bpm: 60,
    chords: [
      [48, 55, 62, 67],
      [45, 52, 60, 64],
      [41, 48, 57, 64],
      [43, 50, 59, 62],
    ],
    pad: 'sawtooth',
    lead: 'sine',
    arp: false,
    beat: false,
  },
  {
    id: 'nightdrive',
    title: 'Night Drive',
    mood: 'Synthwave',
    colors: ['#ff2e8a', '#6a0dad'],
    bpm: 98,
    chords: [
      [45, 52, 57, 60],
      [41, 48, 53, 57],
      [43, 50, 55, 59],
      [40, 47, 52, 55],
    ],
    pad: 'sawtooth',
    lead: 'square',
    arp: true,
    beat: true,
  },
  {
    id: 'lofi',
    title: 'Lo-Fi Morgen',
    mood: 'Entspannte Beats',
    colors: ['#c58b00', '#10a310'],
    bpm: 78,
    chords: [
      [50, 57, 60, 65],
      [43, 53, 57, 62],
      [48, 55, 59, 64],
      [45, 52, 57, 60],
    ],
    pad: 'triangle',
    lead: 'triangle',
    arp: false,
    beat: true,
    crackle: true,
  },
  {
    id: 'polar',
    title: 'Polarlicht',
    mood: 'Glocken & Weite',
    colors: ['#00a6a6', '#3ddc4a'],
    bpm: 70,
    chords: [
      [52, 59, 64, 68],
      [49, 56, 61, 64],
      [45, 52, 57, 61],
      [47, 54, 59, 63],
    ],
    pad: 'sine',
    lead: 'sine',
    arp: true,
    beat: false,
    bells: true,
  },
];

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

class MusicEngine {
  constructor() {
    this.station = null;
    this.timer = null;
    this.bus = null;
    this.step = 0;
    this.nextTime = 0;
  }

  get playing() {
    return !!this.station;
  }

  play(stationId) {
    const st = STATIONS.find((s) => s.id === stationId) || STATIONS[0];
    const ctx = audioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    this.stop(false);
    this.station = st;
    this.bus = ctx.createGain();
    this.bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.bus.gain.exponentialRampToValueAtTime(0.55, ctx.currentTime + 1.5);
    this.bus.connect(masterNode());
    this.bus.connect(reverbNode());
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 50);
    unlock('dj');
    store.set('music', { playing: true, station: st.id, title: st.title, mood: st.mood, lastStation: st.id });
  }

  stop(update = true) {
    const ctx = audioContext();
    clearInterval(this.timer);
    this.timer = null;
    if (this.bus && ctx) {
      const b = this.bus;
      b.gain.cancelScheduledValues(ctx.currentTime);
      b.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
      setTimeout(() => b.disconnect(), 1500);
    }
    this.bus = null;
    this.station = null;
    if (update) store.set('music', { playing: false, station: null, lastStation: store.get('music')?.lastStation });
  }

  toggle(stationId) {
    if (this.playing && (!stationId || this.station.id === stationId)) this.stop();
    else this.play(stationId || store.get('music')?.lastStation || STATIONS[0].id);
  }

  next() {
    const idx = this.station ? STATIONS.indexOf(this.station) : -1;
    this.play(STATIONS[(idx + 1) % STATIONS.length].id);
  }

  prev() {
    const idx = this.station ? STATIONS.indexOf(this.station) : 0;
    this.play(STATIONS[(idx - 1 + STATIONS.length) % STATIONS.length].id);
  }

  schedule() {
    const ctx = audioContext();
    const st = this.station;
    if (!st || !ctx) return;
    const sixteenth = 60 / st.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.25) {
      this.playStep(this.step, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.step++;
    }
  }

  playStep(step, t, sixteenth) {
    const st = this.station;
    const bar = Math.floor(step / 16);
    const chord = st.chords[bar % st.chords.length];
    const pos = step % 16;

    if (pos === 0) chord.forEach((n) => this.voice(midi(n), t, sixteenth * 16, st.pad, 0.05, 1.2, 1400));
    if (pos === 0) this.voice(midi(chord[0] - 12), t, sixteenth * 14, 'sine', 0.12, 0.05, 400);

    if (st.arp && pos % 2 === 0) {
      const n = chord[(pos / 2) % chord.length] + 12;
      this.voice(midi(n), t, sixteenth * 1.8, st.lead, 0.035, 0.005, 3200);
    }
    if (st.bells && (pos === 6 || pos === 13) && Math.random() < 0.7) {
      const n = chord[Math.floor(Math.random() * chord.length)] + 24;
      this.voice(midi(n), t, 1.8, 'sine', 0.03, 0.002, 6000);
    }
    if (!st.arp && !st.bells && pos === 8 && Math.random() < 0.6) {
      const n = chord[Math.floor(Math.random() * chord.length)] + 12;
      this.voice(midi(n), t, sixteenth * 6, st.lead, 0.03, 0.08, 2400);
    }
    if (st.beat) {
      if (pos === 0 || pos === 8 || (pos === 10 && st.id === 'nightdrive')) this.kick(t);
      if (pos === 4 || pos === 12) this.snare(t, st.crackle ? 0.05 : 0.08);
      if (pos % 2 === 0) this.hat(t, pos % 4 === 2 ? 0.025 : 0.014);
    }
    if (st.crackle && Math.random() < 0.35) this.crackle(t);
  }

  voice(freq, t, dur, type, gain, attack, cutoff) {
    const ctx = audioContext();
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = type;
    o2.type = type;
    o.frequency.value = freq;
    o2.frequency.value = freq;
    o2.detune.value = 7;
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.max(0.005, attack));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    o2.connect(f);
    f.connect(g).connect(this.bus);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.1);
    o2.stop(t + dur + 0.1);
  }

  kick(t) {
    const ctx = audioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.16);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.32);
  }

  noiseBurst(t, dur, gain, type, freq) {
    const ctx = audioContext();
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t);
  }

  snare(t, gain) {
    this.noiseBurst(t, 0.18, gain, 'bandpass', 1800);
  }

  hat(t, gain) {
    this.noiseBurst(t, 0.05, gain, 'highpass', 7000);
  }

  crackle(t) {
    this.noiseBurst(t + Math.random() * 0.1, 0.01, 0.02, 'highpass', 3000);
  }
}

export const music = new MusicEngine();
