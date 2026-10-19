// Tastenhinweise unten rechts – passen sich an Tastatur, Xbox- oder PlayStation-Controller an.

import { h, clear, icon } from '../core/dom.js';
import { bus } from '../core/store.js';
import { input } from '../core/input.js';

const KEYBOARD = { accept: 'Enter', back: 'Esc', x: 'X', y: 'Y', menu: 'M', cc: 'C', guide: 'G', lb: 'Q', rb: 'E', lt: 'Bild ↑', rt: 'Bild ↓', ls: '⇧', rs: '' };

const PS_SHAPES = {
  accept: ['#7fb0ff', '<path d="M6 6 L18 18 M18 6 L6 18"/>'],
  back: ['#ff7b7b', '<circle cx="12" cy="12" r="7"/>'],
  x: ['#f59bd6', '<rect x="5.5" y="5.5" width="13" height="13"/>'],
  y: ['#4fd8a8', '<path d="M12 5 L19.5 18 L4.5 18 Z"/>'],
};
const PS_TEXT = { lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2', ls: 'L3', rs: 'R3', cc: 'PS', guide: 'Create', menu: 'Options' };

// Xbox: farbige Buchstaben-Tasten wie auf dem Controller
const XB_LETTERS = {
  accept: ['A', '#3ddc4a'],
  back: ['B', '#ff5a4f'],
  x: ['X', '#3b8cff'],
  y: ['Y', '#f5c518'],
};
const XB_TEXT = { lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', ls: 'LS', rs: 'RS', guide: 'Xbox' };

let base = [];
let current = [];
const stack = [];
let root = null;

function viewGlyph() {
  // „View“: zwei überlappende Fenster
  return h('span.glyph.round', { html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="7" width="11" height="9" rx="1.5"/><rect x="9" y="4" width="11" height="9" rx="1.5"/></svg>' });
}
function menuGlyph() {
  return h('span.glyph.round', { html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 8h12M6 12h12M6 16h12"/></svg>' });
}

export function glyph(action, type = input.type, pad = input.padType) {
  if (type === 'gamepad') {
    if (pad === 'playstation') {
      if (PS_SHAPES[action]) {
        const [color, shape] = PS_SHAPES[action];
        return h('span.glyph.pad', {
          style: { background: '#1c2233' },
          html: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${shape}</svg>`,
        });
      }
      return h('span.glyph', PS_TEXT[action] || action);
    }
    if (XB_LETTERS[action]) {
      const [letter, color] = XB_LETTERS[action];
      return h('span.glyph.pad', { style: { background: color, color: '#0b0e14' } }, letter);
    }
    if (action === 'cc') return viewGlyph();
    if (action === 'menu') return menuGlyph();
    if (action === 'guide') return h('span.glyph.round.xbtn', icon('circle'));
    return h('span.glyph', XB_TEXT[action] || action);
  }
  return h('span.glyph', KEYBOARD[action] || action);
}

function render() {
  if (!root) return;
  clear(root);
  for (const [action, text] of current) root.append(h('span.hint', glyph(action), text));
}

export function initHints(el) {
  root = el;
  bus.on('input-type', render);
}

export function setHints(list) {
  base = list || [];
  current = stack.length ? current : base;
  if (!stack.length) render();
}

export function pushHints(list) {
  stack.push(current);
  current = list || [];
  render();
}

export function popHints() {
  current = stack.length ? stack.pop() : base;
  if (!stack.length) current = base;
  render();
}
