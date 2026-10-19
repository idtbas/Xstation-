// 16 eigene Avatare: Farbverlauf + Symbol.

import { ICONS } from './icons.js';
import { h } from '../core/dom.js';

export const AVATAR_LIST = [
  { id: 'av1', icon: 'rocket', c: ['#0a6cff', '#00b3ff'] },
  { id: 'av2', icon: 'cat', c: ['#ff7a18', '#ffb347'] },
  { id: 'av3', icon: 'bot', c: ['#10a310', '#8be04e'] },
  { id: 'av4', icon: 'ghost', c: ['#6a3cff', '#b07bff'] },
  { id: 'av5', icon: 'bird', c: ['#00a6a6', '#4de1c1'] },
  { id: 'av6', icon: 'flame', c: ['#e8263d', '#ff7a59'] },
  { id: 'av7', icon: 'snowflake', c: ['#3a7bd5', '#a8e0ff'] },
  { id: 'av8', icon: 'crown', c: ['#c58b00', '#ffd54a'] },
  { id: 'av9', icon: 'rabbit', c: ['#d63384', '#ff8cc6'] },
  { id: 'av10', icon: 'gem', c: ['#0f9b8e', '#5ef2d0'] },
  { id: 'av11', icon: 'orbit', c: ['#1d2b64', '#5b7cfa'] },
  { id: 'av12', icon: 'zap', c: ['#0b5e0b', '#2ccf2c'] },
  { id: 'av13', icon: 'turtle', c: ['#2f7d32', '#a5d66b'] },
  { id: 'av14', icon: 'swords', c: ['#4a4e69', '#9a8c98'] },
  { id: 'av15', icon: 'fish', c: ['#005bea', '#00c6fb'] },
  { id: 'av16', icon: 'leaf', c: ['#0a6cff', '#10a310'] },
];

const byId = Object.fromEntries(AVATAR_LIST.map((a) => [a.id, a]));
let seq = 0;

export function avatarSvg(id) {
  const a = byId[id] || AVATAR_LIST[0];
  const gid = `ag${++seq}`;
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
  <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a.c[0]}"/><stop offset="1" stop-color="${a.c[1]}"/></linearGradient>
  <radialGradient id="${gid}h" cx="0.3" cy="0.2" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
  <rect width="100" height="100" fill="url(#${gid})"/>
  <rect width="100" height="100" fill="url(#${gid}h)"/>
  <g transform="translate(24 24) scale(2.17)" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round">${ICONS[a.icon]}</g>
</svg>`;
}

export function avatarEl(id, { size = '3rem', status = null, cls = '' } = {}) {
  const el = h('div.avatar', { class: cls, style: { width: size, height: size }, html: avatarSvg(id) });
  if (status) el.append(h('span.dot', { dataset: { status } }));
  return el;
}

export const STATUS_LABEL = {
  online: 'Online',
  busy: 'Beschäftigt',
  away: 'Abwesend',
  invisible: 'Offline erscheinen',
  offline: 'Offline',
};
