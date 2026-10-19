// Kleine DOM-Helfer: h('div.klasse', {attr}, kinder…)

import { ICONS } from '../ui/icons.js';

export function h(tag, props, ...children) {
  if (props == null || typeof props !== 'object' || props instanceof Node || Array.isArray(props)) {
    if (props !== undefined && props !== null) children.unshift(props);
    props = {};
  }
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = [el.className, value].filter(Boolean).join(' ');
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'text') el.textContent = value;
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

export function icon(name, cls = '') {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.circle}</svg>`;
  return wrap.firstChild;
}

export function svgEl(markup) {
  const wrap = document.createElement('div');
  wrap.innerHTML = markup.trim();
  return wrap.firstChild;
}

export function $(sel, root = document) {
  return root.querySelector(sel);
}

export function $$(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

export function animationDone(el, fallback = 1200) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    el.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, fallback);
  });
}
