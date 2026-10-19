// Wiederverwendbare Bedienelemente: Listenzeilen, Schalter, Regler.

import { h, icon } from '../core/dom.js';
import { input } from '../core/input.js';
import { play } from '../core/sound.js';

export function rowBtn({ iconName, iconEl, title, sub, end, onClick, key, cls = '', danger = false }) {
  const el = h(
    'button.row-btn.nav',
    { class: `${cls}${danger ? ' danger' : ''}`, dataset: key ? { key } : undefined },
    iconEl || (iconName ? icon(iconName) : null),
    h('div.rb-main', h('div.rb-title', title), sub ? h('div.rb-sub', sub) : null),
    end != null ? h('div.rb-end', end) : null,
  );
  if (onClick) el.addEventListener('click', onClick);
  return el;
}

export function toggleRow({ iconName, title, sub, get, set, key }) {
  const tg = h('span.toggle', { class: get() ? 'on' : '' });
  const el = rowBtn({ iconName, title, sub, end: tg, key });
  el.setAttribute('role', 'switch');
  el.setAttribute('aria-checked', String(get()));
  el.dataset.silent = '';
  el.addEventListener('click', () => {
    const next = !get();
    set(next);
    tg.classList.toggle('on', next);
    el.setAttribute('aria-checked', String(next));
    play('toggle');
  });
  return el;
}

// Regler: Links/Rechts ändert den Wert, solange er fokussiert ist.
export function slider({ iconName, value, min = 0, max = 1, step = 0.05, format = (v) => `${Math.round(v * 100)}`, onChange, key }) {
  let current = value;
  const fill = h('div.fill');
  const knob = h('div.knob');
  const val = h('span.val');
  const track = h('div.track', fill, knob);
  const el = h('div.slider.nav', { tabindex: '-1', role: 'slider', dataset: key ? { key } : undefined }, iconName ? icon(iconName) : null, track, val);

  function render() {
    const pct = ((current - min) / (max - min)) * 100;
    fill.style.width = `${pct}%`;
    knob.style.left = `${pct}%`;
    val.textContent = format(current);
    el.setAttribute('aria-valuenow', String(current));
  }
  function setValue(v) {
    const next = Math.min(max, Math.max(min, Math.round(v / step) * step));
    if (next === current) return;
    current = next;
    render();
    onChange?.(current);
    play('move');
  }
  let release = null;
  el.addEventListener('navfocus', () => {
    release?.();
    release = input.intercept((action) => {
      if (!el.classList.contains('focused')) return false;
      if (action === 'left') return setValue(current - step), true;
      if (action === 'right') return setValue(current + step), true;
      return false;
    });
  });
  el.addEventListener('navblur', () => {
    release?.();
    release = null;
  });
  track.addEventListener('pointerdown', (ev) => {
    const move = (e) => {
      const r = track.getBoundingClientRect();
      setValue(min + ((e.clientX - r.left) / r.width) * (max - min));
    };
    move(ev);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', move), { once: true });
  });
  render();
  return el;
}

export function label(text) {
  return h('div.g-label', text);
}
