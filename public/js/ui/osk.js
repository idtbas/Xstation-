// Bildschirmtastatur im Xbox-Stil (QWERTZ mit Umlauten).
// Controller: A = Taste, X = Löschen, Y = Leerzeichen, LT = Umschalt, RT = Symbole,
//             LB/RB = Cursor bewegen, Menu = Fertig, B = Schließen.

import { h, icon, clear, wait } from '../core/dom.js';
import { nav } from '../core/focus.js';
import { input } from '../core/input.js';
import { play } from '../core/sound.js';
import { pushHints, popHints } from './hints.js';

const LOWER = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'ß'],
  ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p', 'ü'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ö', 'ä'],
  ['⇧', 'y', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '-'],
];
const UPPER_EXTRA = { ',': ';', '.': ':', '-': '_', ß: '?' };
const SYMBOLS = [
  ['!', '"', '§', '$', '%', '&', '/', '(', ')', '=', '?'],
  ['+', '*', '#', "'", '<', '>', '[', ']', '{', '}', '€'],
  [':', ';', '_', '~', '^', '|', '\\', '`', '°', '´', '@'],
  ['ABC', '¡', '¿', '«', '»', '„', '“', '–', '…', '·', '£'],
];

let openState = null;

export function isKeyboardOpen() {
  return !!openState;
}

export function openKeyboard({ value = '', label = 'Text eingeben', type = 'text', placeholder = '', maxLength = 500, onInput = null, submitLabel = 'Fertig' } = {}) {
  if (openState) openState.close(false);
  return new Promise((resolve) => {
    let text = String(value);
    let caret = text.length;
    let shift = 0; // 0 aus, 1 einmal, 2 dauerhaft
    let symbols = false;
    let layer = null;
    let closed = false;
    const urlLike = type === 'url' || type === 'search';

    const field = h('div.osk-field');
    const counter = h('div.osk-count');

    function renderField() {
      clear(field);
      const shown = type === 'password' ? '•'.repeat(text.length) : text;
      if (!text) field.append(h('span.osk-ph', placeholder || ' '));
      field.append(h('span', shown.slice(0, caret)), h('span.osk-caret'), h('span', shown.slice(caret)));
      counter.textContent = `${text.length}/${maxLength}`;
    }

    function emit() {
      renderField();
      onInput?.(text);
    }

    function insert(str) {
      if (text.length + str.length > maxLength) {
        play('error');
        return;
      }
      text = text.slice(0, caret) + str + text.slice(caret);
      caret += str.length;
      if (shift === 1) {
        shift = 0;
        relabel();
      }
      play('type');
      emit();
    }

    function backspace() {
      if (!caret) return;
      text = text.slice(0, caret - 1) + text.slice(caret);
      caret -= 1;
      play('type');
      emit();
    }

    function moveCaret(d) {
      caret = Math.max(0, Math.min(text.length, caret + d));
      play('move');
      renderField();
    }

    function toggleShift() {
      shift = (shift + 1) % 3;
      if (symbols) symbols = false;
      play('toggle');
      relabel();
    }

    function toggleSymbols() {
      symbols = !symbols;
      shift = 0;
      play('toggle');
      relabel();
    }

    // ---------- Tasten ----------
    const charKeys = [];
    const rows = LOWER.map((row, r) =>
      row.map((_, c) => {
        const key = h('button.osk-key.nav', { dataset: { row: String(r), col: String(c) } });
        key.addEventListener('click', () => {
          const label = key.dataset.char;
          if (label === '⇧') return toggleShift();
          if (label === 'ABC') return toggleSymbols();
          insert(label);
        });
        charKeys.push(key);
        return key;
      }),
    );

    function charFor(r, c) {
      if (symbols) return SYMBOLS[r][c];
      const base = LOWER[r][c];
      if (base === '⇧') return base;
      if (!shift) return base;
      return UPPER_EXTRA[base] || base.toUpperCase();
    }

    function relabel() {
      charKeys.forEach((key) => {
        const ch = charFor(Number(key.dataset.row), Number(key.dataset.col));
        key.dataset.char = ch;
        key.textContent = ch;
        key.classList.toggle('special', ch === '⇧' || ch === 'ABC');
        key.classList.toggle('active', ch === '⇧' && shift > 0);
        key.classList.toggle('locked', ch === '⇧' && shift === 2);
      });
      symKey.textContent = symbols ? 'ABC' : '&123';
    }

    const special = (cls, content, span, onClick, title) => {
      const k = h(`button.osk-key.special.nav${cls}`, { style: { gridColumn: `span ${span}` }, dataset: { row: '4' }, 'aria-label': title || '' }, content);
      k.addEventListener('click', onClick);
      return k;
    };
    const symKey = special('', '&123', 2, toggleSymbols, 'Symbole');
    const bottom = [
      symKey,
      urlLike ? special('', '/', 1, () => insert('/'), 'Schrägstrich') : special('', '@', 1, () => insert('@'), 'At-Zeichen'),
      special('.osk-space', 'Leerzeichen', urlLike ? 3 : 4, () => insert(' '), 'Leerzeichen'),
      urlLike ? special('', '.de', 1, () => insert('.de'), '.de') : null,
      special('', icon('arrow-left'), 2, backspace, 'Löschen'),
      special('.osk-done', h('span', icon('check'), submitLabel), 2, () => close(true), submitLabel),
    ].filter(Boolean);

    const grid = h('div.osk-grid', { dataset: { group: '', trap: 'xy' } }, rows.flat(), bottom);

    // Am Rand weiterspringen (wie auf der Konsole)
    grid.addEventListener('navedge', (ev) => {
      const cur = ev.target.closest('.osk-key');
      if (!cur) return;
      const dir = ev.detail.dir;
      const all = [...grid.querySelectorAll('.osk-key')];
      const sameRow = all.filter((k) => k.dataset.row === cur.dataset.row);
      if (dir === 'right') nav.focus(sameRow[0], { sound: true });
      else if (dir === 'left') nav.focus(sameRow[sameRow.length - 1], { sound: true });
    });

    const panel = h(
      'div.osk',
      h('div.osk-head', h('div.osk-label', label), counter),
      field,
      grid,
      h(
        'div.osk-legend',
        h('span', h('b', 'X'), 'Löschen'),
        h('span', h('b', 'Y'), 'Leerzeichen'),
        h('span', h('b', 'LT'), 'Umschalt'),
        h('span', h('b', 'RT'), 'Symbole'),
        h('span', h('b', 'LB/RB'), 'Cursor'),
        h('span', h('b', '≡'), submitLabel),
        h('span', h('b', 'B'), 'Schließen'),
      ),
    );
    const root = h('div.osk-root', h('div.osk-dim', { onclick: () => close(false) }), panel);

    // Physische Tastatur funktioniert ebenfalls
    function onKey(ev) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      let handled = true;
      if (ev.key === 'Enter') close(true);
      else if (ev.key === 'Escape') close(false);
      else if (ev.key === 'Backspace') backspace();
      else if (ev.key.length === 1) insert(ev.key);
      else handled = false;
      if (handled) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    }

    const release = input.intercept((action) => {
      switch (action) {
        case 'x':
          backspace();
          return true;
        case 'y':
          insert(' ');
          return true;
        case 'lt':
        case 'ls':
          toggleShift();
          return true;
        case 'rt':
          toggleSymbols();
          return true;
        case 'lb':
          moveCaret(-1);
          return true;
        case 'rb':
          moveCaret(1);
          return true;
        case 'menu':
          close(true);
          return true;
        case 'cc':
        case 'guide':
          return true;
        default:
          return false;
      }
    });

    async function close(submitted) {
      if (closed) return;
      closed = true;
      openState = null;
      release();
      window.removeEventListener('keydown', onKey, true);
      nav.popLayer(layer);
      popHints();
      play(submitted ? 'select' : 'back');
      root.classList.add('out');
      resolve({ value: text, submitted });
      await wait(220);
      root.remove();
    }

    relabel();
    renderField();
    document.getElementById('overlays').append(root);
    window.addEventListener('keydown', onKey, true);
    layer = nav.pushLayer(root, { name: 'osk', onBack: () => (close(false), true), initial: () => rows[1][0] });
    pushHints([
      ['accept', 'Taste'],
      ['x', 'Löschen'],
      ['y', 'Leerzeichen'],
      ['menu', submitLabel],
      ['back', 'Schließen'],
    ]);
    play('open');
    openState = { close };
  });
}

// Öffnet die Tastatur für ein Eingabefeld der App und schreibt live hinein.
export function keyboardForInput(el) {
  const label =
    el.closest('.field')?.querySelector('label')?.textContent || el.getAttribute('aria-label') || el.placeholder || 'Text eingeben';
  const update = (v) => {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  return openKeyboard({
    value: el.value,
    label,
    type: el.type === 'password' ? 'password' : el.type === 'url' || el.closest('.br-url, .sd-search') ? 'url' : 'text',
    placeholder: el.placeholder,
    maxLength: el.maxLength > 0 ? el.maxLength : 500,
    onInput: update,
  }).then(({ value, submitted }) => {
    update(value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (el.isConnected) nav.focus(el, { silent: true });
    if (submitted) {
      const handled = !el.dispatchEvent(new CustomEvent('enter', { cancelable: true, bubbles: true }));
      if (!handled) nav.move('down');
    }
    return { value, submitted };
  });
}
