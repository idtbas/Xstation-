// Tastenhinweise unten rechts – passen sich an Tastatur, Xbox- oder PlayStation-Controller an.

import { h, clear, icon } from '../core/dom.js';
import { bus } from '../core/store.js';
import { input } from '../core/input.js';

const KEYBOARD = { accept: 'Enter', back: 'Esc', x: 'X', y: 'Y', menu: 'M', home: 'C', guide: 'G', lb: 'Q', rb: 'E' };

const PS_SHAPES = {
  accept: ['#7fb0ff', '<path d="M6 6 L18 18 M18 6 L6 18"/>'],
  back: ['#ff7b7b', '<circle cx="12" cy="12" r="7"/>'],
  x: ['#f59bd6', '<rect x="5.5" y="5.5" width="13" height="13"/>'],
  y: ['#4fd8a8', '<path d="M12 5 L19.5 18 L4.5 18 Z"/>'],
};
const XB_LETTERS = {
  accept: ['A', '#3ddc4a'],
  back: ['B', '#ff5a4f'],
  x: ['X', '#3b8cff'],
  y: ['Y', '#f5c518'],
};

let current = [];
let root = null;

function glyph(action) {
  const type = input.type;
  if (type === 'gamepad') {
    const pad = input.padType;
    if (pad === 'playstation' && PS_SHAPES[action]) {
      const [color, shape] = PS_SHAPES[action];
      return h('span.glyph.pad', {
        style: { background: '#1c2233' },
        html: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${shape}</svg>`,
      });
    }
    if (XB_LETTERS[action]) {
      const [letter, color] = XB_LETTERS[action];
      return h('span.glyph.pad', { style: { background: color, color: '#0b0e14' } }, letter);
    }
    const special = { home: 'house', guide: pad === 'playstation' ? 'square' : 'app-window', menu: 'ellipsis', lb: null, rb: null };
    if (action === 'lb') return h('span.glyph', pad === 'playstation' ? 'L1' : 'LB');
    if (action === 'rb') return h('span.glyph', pad === 'playstation' ? 'R1' : 'RB');
    return h('span.glyph', icon(special[action] || 'circle'));
  }
  return h('span.glyph', KEYBOARD[action] || action);
}

function render() {
  if (!root) return;
  clear(root);
  for (const [action, label] of current) root.append(h('span.hint', glyph(action), label));
}

export function initHints(el) {
  root = el;
  bus.on('input-type', render);
}

export function setHints(list) {
  current = list || [];
  render();
}
