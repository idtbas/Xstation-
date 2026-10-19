// Boot-Animation auf Canvas (PS5-inspiriert): Licht sammelt Funken, explodiert,
// danach schweben blaue und grüne Lichtkreise. Komplett eigenständig umgesetzt.

import { hexA } from './particles.js';

const BLUE = '#2b8bff';
const CYAN = '#7fd6ff';
const GREEN = '#3ddc4a';

export class BootFx {
  constructor(canvas, { burstAt = 2.6, onBurst } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.burstAt = burstAt;
    this.onBurst = onBurst;
    this.t = 0;
    this.sparks = [];
    this.debris = [];
    this.bokeh = [];
    this.mist = [];
    this.burst = false;
    this.running = false;
    this.frame = this.frame.bind(this);
    this.resize();
    window.addEventListener('resize', (this._r = () => this.resize()));
    for (let i = 0; i < 5; i++) {
      this.mist.push({ a: Math.random() * Math.PI * 2, d: 0.08 + Math.random() * 0.12, r: 0.25 + Math.random() * 0.2, s: 0.1 + Math.random() * 0.2 });
    }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.w = this.canvas.clientWidth || window.innerWidth;
    this.h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  start() {
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    window.removeEventListener('resize', this._r);
  }

  skipToBurst() {
    if (this.t < this.burstAt) this.t = this.burstAt - 0.05;
  }

  spawnSpark() {
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.max(this.w, this.h) * (0.45 + Math.random() * 0.35);
    this.sparks.push({ ang, dist, speed: 120 + Math.random() * 220, life: 1, color: Math.random() < 0.22 ? GREEN : Math.random() < 0.5 ? CYAN : BLUE });
  }

  explode() {
    this.burst = true;
    this.burstT = this.t;
    const cx = this.w / 2;
    const cy = this.h / 2;
    for (let i = 0; i < 260; i++) {
      const ang = Math.random() * Math.PI * 2;
      const v = 200 + Math.random() * 900;
      this.debris.push({
        x: cx,
        y: cy,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v,
        life: 0.8 + Math.random() * 1.4,
        age: 0,
        r: 0.8 + Math.random() * 2.2,
        color: Math.random() < 0.4 ? GREEN : Math.random() < 0.5 ? '#ffe9a8' : CYAN,
      });
    }
    const s = Math.min(this.w, this.h);
    for (let i = 0; i < 26; i++) {
      this.bokeh.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        r: s * (0.02 + Math.random() * 0.08),
        vx: (Math.random() - 0.5) * 10,
        vy: -4 - Math.random() * 10,
        a: 0,
        target: 0.05 + Math.random() * 0.1,
        color: i % 2 ? BLUE : GREEN,
      });
    }
    this.sparks = [];
    this.onBurst?.();
  }

  frame(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    const { ctx, w, h } = this;
    const cx = w / 2;
    const cy = h / 2;
    const s = Math.min(w, h);
    const t = this.t;

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = this.burst ? 'rgba(2,4,10,0.32)' : 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    if (!this.burst) {
      const p = Math.min(1, Math.max(0, (t - 0.3) / (this.burstAt - 0.3)));
      // Nebel
      for (const m of this.mist) {
        m.a += dt * m.s;
        const mx = cx + Math.cos(m.a) * s * m.d;
        const my = cy + Math.sin(m.a * 1.3) * s * m.d * 0.6;
        const r = s * m.r * (0.6 + p * 0.6);
        const g = ctx.createRadialGradient(mx, my, 0, mx, my, r);
        g.addColorStop(0, hexA('#1c4fd6', 0.05 + p * 0.07));
        g.addColorStop(1, hexA('#1c4fd6', 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      // Lichtkern
      const coreR = s * (0.03 + p * p * 0.12) * (1 + 0.06 * Math.sin(t * 9));
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3.2);
      core.addColorStop(0, hexA('#ffffff', 0.55 * p + 0.1));
      core.addColorStop(0.18, hexA(CYAN, 0.45 * p + 0.05));
      core.addColorStop(0.5, hexA(BLUE, 0.2 * p));
      core.addColorStop(1, hexA(BLUE, 0));
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 3.2, 0, Math.PI * 2);
      ctx.fill();

      // Funken fliegen zum Zentrum
      const rate = 20 + p * 160;
      for (let i = 0; i < rate * dt; i++) this.spawnSpark();
      ctx.lineCap = 'round';
      for (const sp of this.sparks) {
        const prev = sp.dist;
        sp.speed *= 1 + dt * 2.2;
        sp.dist -= sp.speed * dt;
        sp.ang += dt * 0.35;
        const x1 = cx + Math.cos(sp.ang) * prev;
        const y1 = cy + Math.sin(sp.ang) * prev;
        const x2 = cx + Math.cos(sp.ang) * Math.max(0, sp.dist);
        const y2 = cy + Math.sin(sp.ang) * Math.max(0, sp.dist);
        ctx.strokeStyle = hexA(sp.color, 0.75);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      this.sparks = this.sparks.filter((sp) => sp.dist > coreR * 0.5);
      if (t >= this.burstAt) this.explode();
    } else {
      const bt = t - this.burstT;
      // Blitz & Stoßwelle
      if (bt < 1.2) {
        const flash = Math.max(0, 1 - bt / 0.7);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * (0.2 + bt * 1.4));
        g.addColorStop(0, hexA('#ffffff', 0.9 * flash));
        g.addColorStop(0.4, hexA(CYAN, 0.45 * flash));
        g.addColorStop(1, hexA(BLUE, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = hexA('#bfe6ff', 0.6 * (1 - bt / 1.2));
        ctx.lineWidth = 3 + 10 * (1 - bt / 1.2);
        ctx.beginPath();
        ctx.arc(cx, cy, s * bt * 0.9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = hexA(GREEN, 0.4 * (1 - bt / 1.2));
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, s * bt * 0.65, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Trümmerfunken
      for (const d of this.debris) {
        d.age += dt;
        d.vx *= 1 - dt * 1.8;
        d.vy *= 1 - dt * 1.8;
        d.vy += 30 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        const a = Math.max(0, 1 - d.age / d.life);
        ctx.fillStyle = hexA(d.color, a);
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      this.debris = this.debris.filter((d) => d.age < d.life);
      // Bokeh
      for (const b of this.bokeh) {
        b.a += (b.target - b.a) * dt * 0.8;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.y < -b.r) b.y = h + b.r;
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        g.addColorStop(0, hexA(b.color, b.a));
        g.addColorStop(0.75, hexA(b.color, b.a * 0.55));
        g.addColorStop(1, hexA(b.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }
      // sanftes Grundlicht
      const amb = ctx.createRadialGradient(cx, cy * 0.9, 0, cx, cy, s * 0.9);
      amb.addColorStop(0, hexA('#0d3fa8', 0.05));
      amb.addColorStop(1, hexA('#0d3fa8', 0));
      ctx.fillStyle = amb;
      ctx.fillRect(0, 0, w, h);
    }
    requestAnimationFrame(this.frame);
  }
}
