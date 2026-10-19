// Prozedural erzeugte Spielgrafiken (SVG). Keine fremden Bilddateien.
// Ergebnisse werden als Blob-URLs zwischengespeichert, damit der Browser sie nur einmal rastert.

import { ICONS } from './icons.js';

const W = 1920;
const H = 1080;
const cache = new Map();

function rng(seedStr) {
  let seed = 0;
  for (const c of seedStr) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ridge(rand, { base, amp, steps = 18, jag = 0.5, smooth = false }) {
  const pts = [];
  const phase = [rand() * 6, rand() * 6, rand() * 6];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * W;
    const t = i / steps;
    let y = base - amp * (0.55 * Math.sin(t * 3.1 + phase[0]) + 0.3 * Math.sin(t * 7.3 + phase[1]) + 0.15 * Math.sin(t * 13 + phase[2]));
    y -= amp * jag * (rand() - 0.5);
    pts.push([x, y]);
  }
  let d = `M0 ${H} L0 ${pts[0][1].toFixed(1)}`;
  if (smooth) {
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const mx = (x0 + x1) / 2;
      d += ` Q${x0.toFixed(1)} ${y0.toFixed(1)} ${mx.toFixed(1)} ${((y0 + y1) / 2).toFixed(1)}`;
    }
    d += ` L${W} ${pts[pts.length - 1][1].toFixed(1)}`;
  } else {
    for (const [x, y] of pts) d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d + ` L${W} ${H} Z`;
}

function stars(rand, count, maxY, color = '#fff') {
  let s = '';
  for (let i = 0; i < count; i++) {
    const r = rand() < 0.08 ? 2.2 : rand() * 1.3 + 0.4;
    s += `<circle cx="${(rand() * W).toFixed(0)}" cy="${(rand() * maxY).toFixed(0)}" r="${r.toFixed(2)}" fill="${color}" opacity="${(0.35 + rand() * 0.65).toFixed(2)}"/>`;
  }
  return s;
}

function grad(id, stops, x2 = 0, y2 = 1) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops
    .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`)
    .join('')}</linearGradient>`;
}

function radial(id, stops, cx = 0.5, cy = 0.5, r = 0.5) {
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops
    .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`)
    .join('')}</radialGradient>`;
}

const SCENES = {
  synthwave(rand) {
    const horizon = 640;
    let grid = '';
    for (let i = -24; i <= 24; i++) {
      const x = W / 2 + i * 150;
      grid += `<line x1="${W / 2 + i * 14}" y1="${horizon}" x2="${x}" y2="${H}" />`;
    }
    for (let i = 1; i < 14; i++) {
      const y = horizon + Math.pow(i / 13, 2.2) * (H - horizon);
      grid += `<line x1="0" y1="${y.toFixed(1)}" x2="${W}" y2="${y.toFixed(1)}" />`;
    }
    let bands = '';
    for (let i = 0; i < 7; i++) {
      const y = 470 + i * 26 + i * i * 1.5;
      bands += `<rect x="0" y="${y}" width="${W}" height="${4 + i * 2.2}" fill="#000"/>`;
    }
    return {
      defs:
        grad('sky', [
          [0, '#090019'],
          [0.45, '#2a0757'],
          [0.8, '#a3127a'],
          [1, '#ff4f7b'],
        ]) +
        grad('sun', [
          [0, '#ffe66b'],
          [0.5, '#ff8a3d'],
          [1, '#ff2e8a'],
        ]) +
        grad('floor', [
          [0, '#1a0233'],
          [1, '#05000d'],
        ]) +
        radial('glow', [
          [0, '#ff4fa3', 0.6],
          [1, '#ff4fa3', 0],
        ]) +
        `<mask id="sunmask"><rect width="${W}" height="${H}" fill="#fff"/>${bands}</mask>`,
      body: `
<rect width="${W}" height="${horizon}" fill="url(#sky)"/>
${stars(rand, 140, 420)}
<ellipse cx="${W / 2}" cy="${horizon}" rx="900" ry="300" fill="url(#glow)"/>
<circle cx="${W / 2}" cy="430" r="250" fill="url(#sun)" mask="url(#sunmask)"/>
<path d="${ridge(rand, { base: horizon, amp: 120, steps: 22, jag: 1.2 })}" fill="#2c0a4f"/>
<path d="${ridge(rand, { base: horizon + 10, amp: 60, steps: 30, jag: 1.4 })}" fill="#170331"/>
<rect y="${horizon}" width="${W}" height="${H - horizon}" fill="url(#floor)"/>
<g stroke="#ff3fb4" stroke-width="2.4" opacity="0.85">${grid}</g>
<rect y="${horizon - 2}" width="${W}" height="4" fill="#ff8fd6" opacity="0.9"/>`,
    };
  },

  dusk(rand) {
    return {
      defs:
        grad('sky', [
          [0, '#0b1030'],
          [0.45, '#3b2a6b'],
          [0.75, '#c0587e'],
          [1, '#ffb070'],
        ]) +
        radial('moon', [
          [0, '#fff6e0'],
          [0.7, '#ffe7c2'],
          [1, '#ffd29a', 0],
        ]) +
        radial('haze', [
          [0, '#ffc28a', 0.5],
          [1, '#ffc28a', 0],
        ]),
      body: `
<rect width="${W}" height="${H}" fill="url(#sky)"/>
${stars(rand, 120, 450)}
<circle cx="1380" cy="300" r="190" fill="url(#moon)" opacity="0.95"/>
<circle cx="1380" cy="300" r="120" fill="#fff4dc"/>
<ellipse cx="960" cy="760" rx="1400" ry="260" fill="url(#haze)"/>
<path d="${ridge(rand, { base: 640, amp: 190, steps: 16, jag: 1.1 })}" fill="#5a3a78" opacity="0.85"/>
<path d="${ridge(rand, { base: 760, amp: 150, steps: 14, jag: 1.2 })}" fill="#3a2556"/>
<g fill="#22163a">
  <path d="${ridge(rand, { base: 860, amp: 110, steps: 12, jag: 1.3 })}"/>
  <rect x="560" y="520" width="42" height="210"/><rect x="610" y="470" width="58" height="260"/><rect x="676" y="540" width="40" height="190"/>
  <path d="M606 470 L639 410 L672 470 Z"/><path d="M556 520 L581 478 L606 520 Z"/><path d="M672 540 L696 500 L720 540 Z"/>
  <rect x="520" y="600" width="240" height="140"/>
</g>
<path d="${ridge(rand, { base: 980, amp: 70, steps: 10, jag: 1.2 })}" fill="#120b22"/>`,
    };
  },

  ocean(rand) {
    let rays = '';
    for (let i = 0; i < 7; i++) {
      const x = 200 + i * 260 + rand() * 80;
      rays += `<path d="M${x} 0 L${x + 120} 0 L${x + 420} ${H} L${x + 160} ${H} Z" fill="#9ff3ff" opacity="${(0.04 + rand() * 0.06).toFixed(3)}"/>`;
    }
    let bubbles = '';
    for (let i = 0; i < 60; i++) {
      bubbles += `<circle cx="${(rand() * W).toFixed(0)}" cy="${(rand() * H).toFixed(0)}" r="${(rand() * 7 + 2).toFixed(1)}" fill="none" stroke="#bff8ff" stroke-width="1.5" opacity="${(0.2 + rand() * 0.5).toFixed(2)}"/>`;
    }
    let kelp = '';
    for (let i = 0; i < 14; i++) {
      const x = rand() * W;
      const hgt = 180 + rand() * 260;
      kelp += `<path d="M${x.toFixed(0)} ${H} q ${(rand() * 60 - 30).toFixed(0)} -${(hgt / 2).toFixed(0)} 0 -${hgt.toFixed(0)}" stroke="#0a3b3b" stroke-width="${(8 + rand() * 8).toFixed(0)}" fill="none" stroke-linecap="round"/>`;
    }
    return {
      defs:
        grad('sky', [
          [0, '#0bb3c9'],
          [0.35, '#05607a'],
          [1, '#010b1c'],
        ]) +
        radial('sig', [
          [0, '#7dfcff', 0.95],
          [0.25, '#2fe0ff', 0.55],
          [1, '#2fe0ff', 0],
        ]),
      body: `
<rect width="${W}" height="${H}" fill="url(#sky)"/>
${rays}
<circle cx="1220" cy="700" r="300" fill="url(#sig)"/>
<g fill="none" stroke="#7dfcff">
  <circle cx="1220" cy="700" r="80" stroke-width="3" opacity="0.8"/>
  <circle cx="1220" cy="700" r="150" stroke-width="2" opacity="0.45"/>
  <circle cx="1220" cy="700" r="230" stroke-width="1.5" opacity="0.25"/>
</g>
${bubbles}
<path d="${ridge(rand, { base: 980, amp: 90, steps: 16, jag: 0.8, smooth: true })}" fill="#03161f"/>
${kelp}
<path d="${ridge(rand, { base: 1040, amp: 40, steps: 10, jag: 0.6, smooth: true })}" fill="#010a10"/>`,
    };
  },

  forest(rand) {
    let trees = '';
    for (let layer = 0; layer < 3; layer++) {
      const color = ['#2f8f4e', '#1f6b3a', '#124a28'][layer];
      const baseY = 720 + layer * 120;
      for (let i = 0; i < 16; i++) {
        const x = rand() * W;
        const s = (0.6 + rand() * 0.6) * (1 + layer * 0.45);
        trees += `<g transform="translate(${x.toFixed(0)} ${baseY}) scale(${s.toFixed(2)})" fill="${color}"><rect x="-8" y="-20" width="16" height="40" fill="#3b2a1a"/><rect x="-48" y="-80" width="96" height="64"/><rect x="-34" y="-136" width="68" height="60"/><rect x="-18" y="-180" width="36" height="48"/></g>`;
      }
    }
    let blocks = '';
    for (let i = 0; i < 9; i++) {
      const x = 200 + rand() * 1500;
      const y = 120 + rand() * 300;
      const s = 30 + rand() * 50;
      blocks += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${s.toFixed(0)}" height="${s.toFixed(0)}" rx="6" fill="#fff" opacity="${(0.25 + rand() * 0.35).toFixed(2)}" transform="rotate(${(rand() * 30 - 15).toFixed(0)} ${x} ${y})"/>`;
    }
    return {
      defs:
        grad('sky', [
          [0, '#5ec8ff'],
          [0.6, '#bff1d9'],
          [1, '#fff3c4'],
        ]) +
        radial('sun', [
          [0, '#fffbe6'],
          [0.4, '#fff1a8', 0.9],
          [1, '#fff1a8', 0],
        ]),
      body: `
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<circle cx="420" cy="230" r="260" fill="url(#sun)"/>
${blocks}
<path d="${ridge(rand, { base: 700, amp: 80, steps: 10, jag: 0.4, smooth: true })}" fill="#7ccf8a"/>
<path d="${ridge(rand, { base: 820, amp: 70, steps: 10, jag: 0.4, smooth: true })}" fill="#4fae66"/>
${trees}
<path d="${ridge(rand, { base: 1020, amp: 40, steps: 8, jag: 0.4, smooth: true })}" fill="#0d3a1f"/>`,
    };
  },

  space(rand) {
    return {
      defs:
        radial('neb1', [
          [0, '#7b3cff', 0.75],
          [1, '#7b3cff', 0],
        ]) +
        radial('neb2', [
          [0, '#0a6cff', 0.6],
          [1, '#0a6cff', 0],
        ]) +
        radial('neb3', [
          [0, '#10a310', 0.35],
          [1, '#10a310', 0],
        ]) +
        radial('planet', [
          [0, '#ffd59e'],
          [0.55, '#e0794a'],
          [1, '#3a1430'],
        ], 0.35, 0.3, 0.75),
      body: `
<rect width="${W}" height="${H}" fill="#03030b"/>
<ellipse cx="500" cy="380" rx="700" ry="420" fill="url(#neb1)"/>
<ellipse cx="1500" cy="760" rx="800" ry="420" fill="url(#neb2)"/>
<ellipse cx="1100" cy="200" rx="600" ry="260" fill="url(#neb3)"/>
${stars(rand, 420, H)}
<g transform="rotate(-18 1300 560)">
  <ellipse cx="1300" cy="560" rx="470" ry="90" fill="none" stroke="#f3c48d" stroke-width="16" opacity="0.5"/>
  <circle cx="1300" cy="560" r="250" fill="url(#planet)"/>
  <path d="M830 560 A470 90 0 0 0 1770 560" fill="none" stroke="#ffe0b0" stroke-width="12" opacity="0.85"/>
</g>
<circle cx="420" cy="820" r="60" fill="#9fb4d8"/><circle cx="400" cy="805" r="60" fill="#03030b" opacity="0.55"/>
<g fill="#e8f1ff" opacity="0.9">
  <path d="M640 420 l40 12 l-40 12 l8 -12z"/><path d="M700 470 l34 10 l-34 10 l7 -10z"/><path d="M610 500 l30 9 l-30 9 l6 -9z"/>
</g>`,
    };
  },

  volcano(rand) {
    let embers = '';
    for (let i = 0; i < 90; i++) {
      embers += `<circle cx="${(rand() * W).toFixed(0)}" cy="${(rand() * 800).toFixed(0)}" r="${(rand() * 3.5 + 1).toFixed(1)}" fill="#ffb347" opacity="${(0.3 + rand() * 0.7).toFixed(2)}"/>`;
    }
    return {
      defs:
        grad('sky', [
          [0, '#1a0505'],
          [0.5, '#5e1208'],
          [1, '#ff6a1f'],
        ]) +
        radial('lava', [
          [0, '#fff1a0'],
          [0.3, '#ff9a2e', 0.9],
          [1, '#ff3d00', 0],
        ]) +
        grad('flow', [
          [0, '#ffd36b'],
          [1, '#ff3d00'],
        ]),
      body: `
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<ellipse cx="980" cy="330" rx="420" ry="260" fill="url(#lava)"/>
${embers}
<path d="M240 ${H} L760 400 Q980 330 1200 400 L1720 ${H} Z" fill="#2a0b06"/>
<path d="M840 380 Q980 330 1120 380 L1080 420 Q980 400 880 420 Z" fill="#ffb347"/>
<path d="M960 400 Q930 560 990 700 Q1040 830 960 ${H} L1020 ${H} Q1090 830 1040 700 Q990 560 1010 400 Z" fill="url(#flow)" opacity="0.95"/>
<path d="${ridge(rand, { base: 960, amp: 80, steps: 14, jag: 1.4 })}" fill="#120302"/>`,
    };
  },

  aurora(rand) {
    let trees = '';
    for (let i = 0; i < 40; i++) {
      const x = rand() * W;
      const s = 0.5 + rand() * 0.9;
      trees += `<path transform="translate(${x.toFixed(0)} ${(930 + rand() * 60).toFixed(0)}) scale(${s.toFixed(2)})" d="M0 -170 L36 -90 L18 -90 L52 -20 L24 -20 L60 40 L-60 40 L-24 -20 L-52 -20 L-18 -90 L-36 -90 Z" fill="#071423"/>`;
    }
    let flakes = '';
    for (let i = 0; i < 80; i++) {
      flakes += `<circle cx="${(rand() * W).toFixed(0)}" cy="${(rand() * H).toFixed(0)}" r="${(rand() * 2.6 + 0.8).toFixed(1)}" fill="#fff" opacity="${(0.3 + rand() * 0.6).toFixed(2)}"/>`;
    }
    return {
      defs:
        grad('sky', [
          [0, '#020814'],
          [0.6, '#0b2440'],
          [1, '#1e4a6b'],
        ]) +
        grad('aur', [
          [0, '#3dffa8', 0],
          [0.4, '#3dffa8', 0.7],
          [0.7, '#2bd4ff', 0.45],
          [1, '#8a5cff', 0],
        ], 1, 0) +
        grad('snow', [
          [0, '#eaf4ff'],
          [1, '#8fb2d6'],
        ]) +
        `<filter id="blur" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="28"/></filter>`,
      body: `
<rect width="${W}" height="${H}" fill="url(#sky)"/>
${stars(rand, 200, 600)}
<g filter="url(#blur)" opacity="0.9">
  <path d="M-100 360 C 300 160, 600 460, 1000 280 S 1700 120, 2050 300 L2050 420 C 1700 260, 1300 520, 1000 420 S 300 320, -100 480 Z" fill="url(#aur)"/>
  <path d="M-100 200 C 400 60, 800 300, 1200 160 S 1800 80, 2050 180 L2050 240 C 1700 160, 1300 300, 1000 260 S 300 160, -100 300 Z" fill="url(#aur)" opacity="0.6"/>
</g>
<path d="${ridge(rand, { base: 760, amp: 210, steps: 12, jag: 1.3 })}" fill="url(#snow)"/>
<path d="${ridge(rand, { base: 840, amp: 120, steps: 12, jag: 1.2 })}" fill="#5f84ab"/>
<path d="${ridge(rand, { base: 960, amp: 40, steps: 8, jag: 0.4, smooth: true })}" fill="#d9e8f7"/>
${trees}
${flakes}`,
    };
  },

  stadium(rand) {
    let lights = '';
    for (const [x, y] of [
      [260, 210],
      [760, 150],
      [1160, 150],
      [1660, 210],
    ]) {
      lights += `<circle cx="${x}" cy="${y}" r="190" fill="url(#flood)"/>`;
      lights += `<rect x="${x - 50}" y="${y - 22}" width="100" height="44" rx="6" fill="#fffef0"/>`;
      lights += `<path d="M${x - 50} ${y + 22} L${x - 520} ${H} L${x + 520} ${H} L${x + 50} ${y + 22} Z" fill="#fffde6" opacity="0.05"/>`;
    }
    let crowd = '';
    for (let i = 0; i < 260; i++) {
      crowd += `<circle cx="${(rand() * W).toFixed(0)}" cy="${(520 + rand() * 120).toFixed(0)}" r="${(rand() * 3 + 1.5).toFixed(1)}" fill="${rand() < 0.5 ? '#0a6cff' : '#10a310'}" opacity="${(0.3 + rand() * 0.5).toFixed(2)}"/>`;
    }
    let skyline = '';
    let x = 0;
    while (x < W) {
      const w = 40 + rand() * 90;
      const hgt = 80 + rand() * 220;
      skyline += `<rect x="${x.toFixed(0)}" y="${(480 - hgt).toFixed(0)}" width="${w.toFixed(0)}" height="${hgt.toFixed(0)}" fill="#0b1328"/>`;
      x += w + 4;
    }
    return {
      defs:
        grad('sky', [
          [0, '#03050f'],
          [1, '#14214a'],
        ]) +
        radial('flood', [
          [0, '#ffffff', 0.9],
          [0.25, '#fffbe0', 0.4],
          [1, '#fffbe0', 0],
        ]) +
        grad('pitch', [
          [0, '#1f8f3a'],
          [1, '#0c4d1d'],
        ]),
      body: `
<rect width="${W}" height="${H}" fill="url(#sky)"/>
${stars(rand, 60, 300)}
${skyline}
<rect y="480" width="${W}" height="190" fill="#0e1630"/>
${crowd}
<path d="M0 ${H} L360 660 L1560 660 L${W} ${H} Z" fill="url(#pitch)"/>
<g stroke="#e8fff0" stroke-width="4" fill="none" opacity="0.75">
  <path d="M360 660 L1560 660 L${W} ${H} M0 ${H} L360 660"/>
  <line x1="960" y1="660" x2="960" y2="${H}"/>
  <ellipse cx="960" cy="830" rx="190" ry="70"/>
</g>
${lights}`,
    };
  },
};

function toUrl(key, svg) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  cache.set(key, url);
  return url;
}

export function gameArt(game, variant = 'hero') {
  const key = `${variant}:${game.id}`;
  if (cache.has(key)) return cache.get(key);
  const scene = (SCENES[game.scene] || SCENES.space)(rng(game.id));
  let viewBox = `0 0 ${W} ${H}`;
  let aspect = 'xMidYMid slice';
  if (variant === 'square') viewBox = `${(W - H) / 2 + (game.scene === 'dusk' ? -300 : 0)} 0 ${H} ${H}`;
  if (variant === 'wide') viewBox = `0 ${H * 0.12} ${W} ${H * 0.76}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="${aspect}"><defs>${scene.defs}</defs>${scene.body}</svg>`;
  return toUrl(key, svg);
}

export function appArt(app, variant = 'hero') {
  const key = `app:${variant}:${app.id}`;
  if (cache.has(key)) return cache.get(key);
  const [c1, c2] = app.colors;
  const square = variant === 'square';
  const w = square ? 512 : W;
  const hh = square ? 512 : H;
  const iconSize = square ? 200 : 520;
  const ix = square ? (w - iconSize) / 2 : w * 0.66 - iconSize / 2;
  const iy = (hh - iconSize) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hh}" preserveAspectRatio="xMidYMid slice">
<defs>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
  <radialGradient id="l" cx="0.25" cy="0.15" r="0.9"><stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <radialGradient id="d" cx="0.8" cy="1" r="0.9"><stop offset="0" stop-color="#000" stop-opacity="0.45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${w}" height="${hh}" fill="url(#g)"/>
<rect width="${w}" height="${hh}" fill="url(#d)"/>
<rect width="${w}" height="${hh}" fill="url(#l)"/>
${square ? '' : `<g fill="none" stroke="#fff" stroke-opacity="0.07" stroke-width="2">${Array.from({ length: 9 }, (_, i) => `<circle cx="${w * 0.66}" cy="${hh / 2}" r="${180 + i * 120}"/>`).join('')}</g>`}
<g transform="translate(${ix} ${iy}) scale(${iconSize / 24})" fill="none" stroke="#fff" stroke-width="${square ? 1.5 : 1}" stroke-linecap="round" stroke-linejoin="round" opacity="${square ? 1 : 0.9}">${ICONS[app.icon]}</g>
</svg>`;
  return toUrl(key, svg);
}

export function artFor(item, variant) {
  return item.kind === 'app' ? appArt(item, variant) : gameArt(item, variant);
}
