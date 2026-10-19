// Eingabe: Tastatur, Gamepad (Standard-Mapping) und Maus → Konsolen-Aktionen.

import { nav } from './focus.js';
import { bus } from './store.js';
import { unlockAudio, play } from './sound.js';

const KEYMAP = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'accept',
  ' ': 'accept',
  Escape: 'back',
  Backspace: 'back',
  Home: 'home',
  F1: 'home',
  F2: 'guide',
};
const LETTER_MAP = { w: 'up', s: 'down', a: 'left', d: 'right', c: 'home', g: 'guide', q: 'lb', e: 'rb', x: 'x', y: 'y', m: 'menu' };

const PAD_BUTTONS = {
  0: 'accept',
  1: 'back',
  2: 'x',
  3: 'y',
  4: 'lb',
  5: 'rb',
  8: 'guide',
  9: 'menu',
  12: 'up',
  13: 'down',
  14: 'left',
  15: 'right',
  16: 'home',
};

const DIRS = new Set(['up', 'down', 'left', 'right']);
let lastDirAt = 0;
let enabled = true;
const handlers = [];

export const input = {
  type: 'mouse',
  padType: 'generic',
  // Eigene Handler (z. B. Overlays) – geben true zurück, wenn sie die Aktion verarbeitet haben.
  intercept(fn) {
    handlers.push(fn);
    return () => handlers.splice(handlers.indexOf(fn), 1);
  },
  setEnabled(v) {
    enabled = v;
  },
};

function setInputType(type) {
  if (input.type === type) return;
  input.type = type;
  document.body.dataset.input = type;
  bus.emit('input-type', type);
}

export function dispatch(action, source = 'keyboard') {
  if (!enabled) return;
  for (let i = handlers.length - 1; i >= 0; i--) if (handlers[i](action, source)) return;
  if (DIRS.has(action)) {
    nav.move(action);
    return;
  }
  if (action === 'accept') nav.activate();
  else if (action === 'back') nav.back();
  else bus.emit('action', action);
}

function isTextField(el) {
  return el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button'].includes(el.type)));
}

function onKeyDown(ev) {
  unlockAudio();
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const active = document.activeElement;
  const typing = isTextField(active);
  let action = KEYMAP[ev.key];
  if (!action && !typing && ev.key.length === 1) action = LETTER_MAP[ev.key.toLowerCase()];
  if (ev.key === 'Tab') {
    ev.preventDefault();
    return;
  }
  if (!action) {
    if (typing && ev.key.length === 1) play('type');
    return;
  }

  if (typing) {
    if (action === 'left' || action === 'right' || action === 'accept' && ev.key === ' ' || action === 'back' && ev.key === 'Backspace') {
      return; // Cursor/Tippen im Textfeld
    }
    if (action === 'accept') {
      ev.preventDefault();
      const handled = !active.dispatchEvent(new CustomEvent('enter', { cancelable: true, bubbles: true }));
      if (!handled) dispatch('down');
      return;
    }
    if (action === 'back') {
      ev.preventDefault();
      active.blur();
      setInputType('keyboard');
      dispatch('back');
      return;
    }
    if (DIRS.has(action) && ev.key.startsWith('Arrow')) {
      ev.preventDefault();
      setInputType('keyboard');
      dispatch(action);
    }
    return;
  }

  ev.preventDefault();
  if (DIRS.has(action) && ev.repeat) {
    const now = performance.now();
    if (now - lastDirAt < 85) return;
    lastDirAt = now;
  }
  setInputType('keyboard');
  dispatch(action, 'keyboard');
}

// ---------- Gamepad ----------
const padState = new Map();

function detectPad(id) {
  const s = id.toLowerCase();
  if (s.includes('054c') || s.includes('dualsense') || s.includes('dualshock') || s.includes('wireless controller') || s.includes('playstation')) {
    return 'playstation';
  }
  if (s.includes('045e') || s.includes('xbox') || s.includes('xinput')) return 'xbox';
  return 'generic';
}

function pollPads(now) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (!pad || pad.mapping !== 'standard') continue;
    let st = padState.get(pad.index);
    if (!st) {
      st = { buttons: [], dir: null, dirSince: 0, dirLast: 0 };
      padState.set(pad.index, st);
    }
    pad.buttons.forEach((b, i) => {
      const pressed = b.pressed || b.value > 0.6;
      const was = st.buttons[i];
      st.buttons[i] = pressed;
      if (pressed && !was) {
        const action = PAD_BUTTONS[i];
        if (!action) return;
        unlockAudio();
        const type = detectPad(pad.id);
        if (input.padType !== type) {
          input.padType = type;
          document.body.dataset.pad = type;
          bus.emit('input-type', 'gamepad');
        }
        setInputType('gamepad');
        if (!DIRS.has(action)) dispatch(action, 'gamepad');
      }
    });

    // Richtung aus Steuerkreuz oder linkem Stick, mit Wiederholung beim Halten
    const [ax, ay] = pad.axes;
    let dir = null;
    if (st.buttons[12]) dir = 'up';
    else if (st.buttons[13]) dir = 'down';
    else if (st.buttons[14]) dir = 'left';
    else if (st.buttons[15]) dir = 'right';
    else if (Math.abs(ax) > 0.55 || Math.abs(ay) > 0.55) {
      dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : ay > 0 ? 'down' : 'up';
    }
    if (dir !== st.dir) {
      st.dir = dir;
      st.dirSince = now;
      st.dirLast = now;
      if (dir) {
        setInputType('gamepad');
        dispatch(dir, 'gamepad');
      }
    } else if (dir) {
      const held = now - st.dirSince;
      const interval = held > 1400 ? 60 : 110;
      if (held > 360 && now - st.dirLast > interval) {
        st.dirLast = now;
        dispatch(dir, 'gamepad');
      }
    }

    // Rechter Stick scrollt (z. B. im Browser)
    const ry = pad.axes[3] || 0;
    if (Math.abs(ry) > 0.25) bus.emit('scroll', ry * 26);
  }
  requestAnimationFrame(pollPads);
}

export function initInput() {
  document.body.dataset.input = 'mouse';
  document.body.dataset.pad = 'generic';
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('pointerdown', () => {
    unlockAudio();
    setInputType('mouse');
  });
  window.addEventListener(
    'pointermove',
    (ev) => {
      if (ev.pointerType === 'mouse' && (Math.abs(ev.movementX) + Math.abs(ev.movementY) > 2)) setInputType('mouse');
      if (input.type !== 'mouse') return;
      const el = ev.target.closest?.('.nav');
      if (el) nav.hover(el);
    },
    { passive: true },
  );
  window.addEventListener('focusin', (ev) => {
    const el = ev.target;
    if (el.classList?.contains('nav') && nav.current !== el) nav.hover(el);
  });
  window.addEventListener('gamepadconnected', (ev) => {
    input.padType = detectPad(ev.gamepad.id);
    document.body.dataset.pad = input.padType;
    bus.emit('gamepad', { connected: true, type: input.padType, id: ev.gamepad.id });
  });
  window.addEventListener('gamepaddisconnected', () => bus.emit('gamepad', { connected: false }));
  requestAnimationFrame(pollPads);
}
