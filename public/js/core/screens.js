// Bildschirm-Verwaltung mit PS5-artigen Übergängen (Zoom + Blende).

import { nav } from './focus.js';
import { animationDone } from './dom.js';
import { setHints } from '../ui/hints.js';
import { bus } from './store.js';

const registry = new Map();
const DEFAULT_HINTS = [
  ['accept', 'Auswählen'],
  ['back', 'Zurück'],
];

let root = null;
let busy = Promise.resolve();

export const screens = {
  stack: [],

  init(el) {
    root = el;
  },

  register(name, factory) {
    registry.set(name, factory);
  },

  current() {
    return this.stack[this.stack.length - 1] || null;
  },

  is(name) {
    return this.current()?.name === name;
  },

  go(name, params = {}, opts = {}) {
    busy = busy.then(() => this._go(name, params, opts)).catch((err) => console.error(err));
    return busy;
  },

  back() {
    busy = busy.then(() => this._back()).catch((err) => console.error(err));
    return busy;
  },

  async _go(name, params, { transition = 'zoom', replace = false, reset = false } = {}) {
    const factory = registry.get(name);
    if (!factory) throw new Error(`Unbekannter Bildschirm: ${name}`);
    const prev = this.current();
    const instance = await factory(params);
    const entry = { name, params, instance, layer: null, lastFocus: null };

    if (prev) {
      prev.lastFocus = nav.current;
      nav.popLayer(prev.layer);
      prev.instance.onHide?.();
    }

    let removed = [];
    if (reset) {
      removed = this.stack.slice();
      this.stack = [];
    } else if (replace && prev) {
      removed = [this.stack.pop()];
    }
    this.stack.push(entry);
    await this._swap(prev, entry, transition, 'forward');
    for (const r of removed) r.instance.destroy?.();
  },

  async _back() {
    if (this.stack.length < 2) return false;
    const leaving = this.stack.pop();
    const target = this.current();
    leaving.lastFocus = nav.current;
    nav.popLayer(leaving.layer);
    leaving.instance.onHide?.();
    await this._swap(leaving, target, 'zoom', 'back');
    leaving.instance.destroy?.();
    return true;
  },

  async _swap(from, to, transition, direction) {
    const el = to.instance.el;
    el.classList.add('screen');
    for (const c of [...el.classList]) if (c.startsWith('enter-') || c.startsWith('leave-')) el.classList.remove(c);
    root.append(el);

    to.layer = nav.pushLayer(el, {
      name: to.name,
      onBack: () => (to.instance.onBack ? to.instance.onBack() : this.stack.length > 1 ? (this.back(), true) : false),
      initial: () => (to.lastFocus?.isConnected ? to.lastFocus : to.instance.initialFocus?.()),
    });
    setHints(to.instance.hints || DEFAULT_HINTS);
    to.instance.onShow?.(direction);
    bus.emit('screen', { name: to.name, params: to.params, instance: to.instance });

    if (transition === 'none' || !from) {
      if (from) from.instance.el.remove();
      if (transition !== 'none') {
        el.classList.add('enter-fade');
        await animationDone(el, 900);
        el.classList.remove('enter-fade');
      }
      return;
    }
    const fromEl = from.instance.el;
    const kind = transition === 'fade' ? 'fade' : direction === 'back' ? 'back' : 'zoom';
    fromEl.classList.add(`leave-${kind}`);
    el.classList.add(`enter-${kind}`);
    await Promise.all([animationDone(el, 900), animationDone(fromEl, 700)]);
    fromEl.remove();
    fromEl.classList.remove(`leave-${kind}`);
    el.classList.remove(`enter-${kind}`);
  },

  updateHints(hints) {
    setHints(hints || DEFAULT_HINTS);
  },
};
