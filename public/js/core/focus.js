// Räumliche Fokus-Navigation wie auf einer Konsole (Pfeiltasten / Steuerkreuz).
//
//  .nav                    – fokussierbares Element
//  [data-group]            – Gruppe; mit data-remember merkt sie sich das zuletzt fokussierte Element
//  [data-trap="x|y|xy"]    – Bewegung in dieser Achse verlässt die Gruppe nicht
//  [data-nav-up|down|left|right="selector"] – explizites Ziel

import { play } from './sound.js';
import { bus } from './store.js';

const layers = [];
const memory = new WeakMap();

function visible(el) {
  if (!el.isConnected) return false;
  if (el.closest('[inert], [data-nav-off]')) return false;
  if (el.getAttribute('aria-disabled') === 'true' || el.disabled) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

function focusables(root) {
  return [...root.querySelectorAll('.nav')].filter((el) => visible(el) && ownLayer(el) === root);
}

function ownLayer(el) {
  // Gehört das Element zu dieser Ebene (nicht zu einer verschachtelten Ebene)?
  let node = el;
  while (node) {
    if (node.dataset && node.dataset.layer !== undefined) return node;
    node = node.parentElement;
  }
  return null;
}

function center(r) {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function score(a, b, dir) {
  const ca = center(a);
  const cb = center(b);
  let primary;
  let gap;
  let offset;
  if (dir === 'right' || dir === 'left') {
    if (dir === 'right' ? cb.x <= ca.x + 1 || b.right <= a.right - 1 : cb.x >= ca.x - 1 || b.left >= a.left + 1) return Infinity;
    primary = dir === 'right' ? Math.max(0, b.left - a.right) : Math.max(0, a.left - b.right);
    gap = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
    offset = Math.abs(cb.y - ca.y);
  } else {
    if (dir === 'down' ? cb.y <= ca.y + 1 || b.bottom <= a.bottom - 1 : cb.y >= ca.y - 1 || b.top >= a.top + 1) return Infinity;
    primary = dir === 'down' ? Math.max(0, b.top - a.bottom) : Math.max(0, a.top - b.bottom);
    gap = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
    offset = Math.abs(cb.x - ca.x);
  }
  const overlapBonus = gap === 0 ? 0 : 10000;
  return overlapBonus + primary + gap * 3 + offset * 0.35;
}

function groupOf(el) {
  return el?.closest('[data-group]') || null;
}

function scrollIntoView(el) {
  const scroller = el.parentElement?.closest('.scroll-y, [data-scroll]');
  if (!scroller || scroller.hasAttribute('data-noscroll')) return;
  const sr = scroller.getBoundingClientRect();
  const er = el.getBoundingClientRect();
  const margin = Math.min(sr.height * 0.18, 96);
  if (scroller.dataset.scroll === 'x') {
    const m = Math.min(sr.width * 0.12, 120);
    if (er.left < sr.left + m) scroller.scrollBy({ left: er.left - sr.left - m, behavior: 'smooth' });
    else if (er.right > sr.right - m) scroller.scrollBy({ left: er.right - sr.right + m, behavior: 'smooth' });
    return;
  }
  if (er.top < sr.top + margin) scroller.scrollBy({ top: er.top - sr.top - margin, behavior: 'smooth' });
  else if (er.bottom > sr.bottom - margin) scroller.scrollBy({ top: er.bottom - sr.bottom + margin, behavior: 'smooth' });
}

export const nav = {
  current: null,

  top() {
    return layers[layers.length - 1] || null;
  },

  pushLayer(root, { onBack, initial, name } = {}) {
    root.dataset.layer = name || '';
    const prev = this.top();
    if (prev) prev.saved = this.current;
    const layer = { root, onBack, name, saved: null };
    layers.push(layer);
    this.setCurrent(null);
    requestAnimationFrame(() => {
      if (this.top() !== layer) return;
      const target = typeof initial === 'function' ? initial() : initial;
      this.focus(target || focusables(root)[0] || null, { silent: true });
    });
    return layer;
  },

  popLayer(layer) {
    const idx = layers.indexOf(layer);
    if (idx < 0) return;
    layers.splice(idx, 1);
    if (idx === layers.length) {
      const top = this.top();
      this.setCurrent(null);
      if (top) {
        const target = top.saved && visible(top.saved) ? top.saved : focusables(top.root)[0];
        this.focus(target || null, { silent: true, scroll: false });
      }
    }
  },

  replaceLayerRoot(layer, root) {
    layer.root = root;
    root.dataset.layer = layer.name || '';
  },

  setCurrent(el) {
    if (this.current && this.current !== el) {
      this.current.classList.remove('focused');
      this.current.dispatchEvent(new CustomEvent('navblur', { bubbles: true }));
    }
    this.current = el;
  },

  focus(el, { sound = false, scroll = true, silent = false } = {}) {
    if (!el) {
      this.setCurrent(null);
      return;
    }
    if (el === this.current) {
      el.classList.add('focused');
      return;
    }
    this.setCurrent(el);
    el.classList.add('focused');
    if (document.activeElement !== el) {
      if (!el.hasAttribute('tabindex') && !/^(INPUT|TEXTAREA|BUTTON|SELECT|A)$/.test(el.tagName)) el.tabIndex = -1;
      el.focus({ preventScroll: true });
    }
    const group = groupOf(el);
    if (group) memory.set(group, el);
    if (scroll) scrollIntoView(el);
    if (sound && !silent) play('move');
    el.dispatchEvent(new CustomEvent('navfocus', { bubbles: true }));
    bus.emit('focus', el);
  },

  ensure() {
    const layer = this.top();
    if (!layer) return;
    if (!this.current || !visible(this.current) || ownLayer(this.current) !== layer.root) {
      this.focus(focusables(layer.root)[0] || null, { silent: true });
    }
  },

  move(dir) {
    const layer = this.top();
    if (!layer) return false;
    const cur = this.current;
    if (!cur || !visible(cur) || ownLayer(cur) !== layer.root) {
      this.ensure();
      return !!this.current;
    }

    const explicit = cur.dataset[`nav${dir[0].toUpperCase()}${dir.slice(1)}`];
    if (explicit) {
      const target = layer.root.querySelector(explicit);
      if (target && visible(target)) {
        this.focus(target, { sound: true });
        return true;
      }
    }

    const group = groupOf(cur);
    const axis = dir === 'left' || dir === 'right' ? 'x' : 'y';
    const trapped = group && (group.dataset.trap || '').includes(axis);
    let candidates = focusables(layer.root).filter((el) => el !== cur);
    if (trapped) candidates = candidates.filter((el) => group.contains(el));

    const a = cur.getBoundingClientRect();
    let best = null;
    let bestScore = Infinity;
    for (const el of candidates) {
      const s = score(a, el.getBoundingClientRect(), dir);
      if (s < bestScore) {
        bestScore = s;
        best = el;
      }
    }
    if (!best) {
      cur.dispatchEvent(new CustomEvent('navedge', { bubbles: true, detail: { dir } }));
      return false;
    }

    const targetGroup = groupOf(best);
    if (targetGroup && targetGroup !== group && targetGroup.hasAttribute('data-remember')) {
      const remembered = memory.get(targetGroup);
      if (remembered && visible(remembered) && targetGroup.contains(remembered)) best = remembered;
    }
    this.focus(best, { sound: true });
    return true;
  },

  activate() {
    const el = this.current;
    if (!el || !visible(el)) return;
    if (/^(INPUT|TEXTAREA)$/.test(el.tagName)) {
      el.focus();
      return;
    }
    if (!el.hasAttribute('data-silent')) play('select');
    el.classList.add('pressed');
    setTimeout(() => el.classList.remove('pressed'), 160);
    el.click();
  },

  back() {
    const layer = this.top();
    if (!layer?.onBack) return false;
    const handled = layer.onBack();
    if (handled !== false) play('back');
    return handled !== false;
  },

  // Maus: Hover setzt den Fokus (ohne Ton), wie ein Zeiger auf der Konsole.
  hover(el) {
    const layer = this.top();
    if (!layer || ownLayer(el) !== layer.root || el === this.current) return;
    this.focus(el, { scroll: false, silent: true });
  },

  focusablesIn(root) {
    return focusables(root);
  },
};
