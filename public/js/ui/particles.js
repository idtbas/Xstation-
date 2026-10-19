// Ruhiger Partikel-Hintergrund (Bokeh + Staub), in Blau und Grün.

import { prefs, bus } from '../core/store.js';

export class Ambient {
  constructor(canvas, { bokeh = 16, dust = 70, tint = ['#2b7bff', '#21b521', '#8fc9ff'] } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tint = tint;
    this.items = [];
    this.running = false;
    this.last = 0;
    this.counts = { bokeh, dust };
    this.resize = this.resize.bind(this);
    this.frame = this.frame.bind(this);
    window.addEventListener('resize', this.resize);
    bus.on('prefs', ({ key }) => {
      if (key === 'particles' || key === 'reduceMotion') this.sync();
    });
    this.resize();
    this.seed();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.w = this.canvas.clientWidth || window.innerWidth;
    this.h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  seed() {
    const r = Math.random;
    this.items = [];
    const s = Math.min(this.w, this.h);
    for (let i = 0; i < this.counts.bokeh; i++) {
      this.items.push({
        kind: 'bokeh',
        x: r() * this.w,
        y: r() * this.h,
        r: s * (0.03 + r() * 0.09),
        vx: (r() - 0.5) * 6,
        vy: -2 - r() * 6,
        a: 0.04 + r() * 0.08,
        phase: r() * Math.PI * 2,
        color: this.tint[i % this.tint.length],
      });
    }
    for (let i = 0; i < this.counts.dust; i++) {
      this.items.push({
        kind: 'dust',
        x: r() * this.w,
        y: r() * this.h,
        r: 0.6 + r() * 1.8,
        vx: (r() - 0.5) * 8,
        vy: -4 - r() * 10,
        a: 0.2 + r() * 0.5,
        phase: r() * Math.PI * 2,
        color: '#ffffff',
      });
    }
  }

  enabled() {
    return prefs.get('particles') && document.documentElement.dataset.motion !== 'reduced';
  }

  start() {
    this.wanted = true;
    this.sync();
  }

  stop() {
    this.wanted = false;
    this.sync();
  }

  sync() {
    const should = this.wanted && this.enabled();
    this.canvas.style.opacity = should ? '1' : '0';
    if (should && !this.running) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame(this.frame);
    } else if (!should) {
      this.running = false;
    }
  }

  frame(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (document.hidden) {
      requestAnimationFrame(this.frame);
      return;
    }
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.items) {
      p.phase += dt * 0.5;
      p.x += (p.vx + Math.sin(p.phase) * 4) * dt;
      p.y += p.vy * dt;
      if (p.y < -p.r * 2) {
        p.y = h + p.r * 2;
        p.x = Math.random() * w;
      }
      if (p.x < -p.r * 2) p.x = w + p.r;
      if (p.x > w + p.r * 2) p.x = -p.r;
      const flicker = p.kind === 'dust' ? 0.6 + 0.4 * Math.sin(p.phase * 3) : 1;
      if (p.kind === 'bokeh') {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, hexA(p.color, p.a));
        g.addColorStop(0.7, hexA(p.color, p.a * 0.6));
        g.addColorStop(1, hexA(p.color, 0));
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = hexA(p.color, p.a * flicker);
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(this.frame);
  }
}

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}
