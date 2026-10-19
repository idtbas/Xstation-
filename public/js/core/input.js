// Eingabe: Tastatur, Maus und Controller (vollständige Xbox-Unterstützung) → Konsolen-Aktionen.
//
// Aktionen: up/down/left/right, accept, back, x, y, lb, rb, lt, rt, ls, rs, menu,
//           cc (Control Center), guide, power
// Analoge Ereignisse (über den Bus): 'scroll' {dx, dy} vom rechten Stick,
//                                    'cursor' {x, y, dt} vom linken Stick im Cursor-Modus.

import { nav } from './focus.js';
import { bus, prefs } from './store.js';
import { unlockAudio, play } from './sound.js';
import { setActivePad } from './haptics.js';
import { BTN, normalizePad, applyDeadzone, buttonActions, padName } from './gamepad-map.js';

const KEYMAP = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'accept',
  ' ': 'accept',
  Escape: 'back',
  Backspace: 'back',
  Home: 'cc',
  F1: 'cc',
  F2: 'guide',
  PageUp: 'lt',
  PageDown: 'rt',
  ContextMenu: 'menu',
};
const LETTER_MAP = { w: 'up', s: 'down', a: 'left', d: 'right', c: 'cc', g: 'guide', q: 'lb', e: 'rb', x: 'x', y: 'y', m: 'menu' };

const DIRS = new Set(['up', 'down', 'left', 'right']);
const HOLD_MS = 550;
const REPEAT_DELAY = 360;
let lastDirAt = 0;
let enabled = true;
const handlers = [];

export const input = {
  type: 'mouse',
  padType: 'generic',
  padName: null,
  // 'nav' = linker Stick bewegt den Fokus, 'cursor' = linker Stick steuert einen Zeiger (Browser)
  stickMode: 'nav',
  // Eigene Handler (Overlays, Tastatur, Tests) – geben true zurück, wenn sie die Aktion verarbeitet haben.
  intercept(fn) {
    handlers.push(fn);
    return () => {
      const i = handlers.indexOf(fn);
      if (i >= 0) handlers.splice(i, 1);
    };
  },
  setEnabled(v) {
    enabled = v;
  },
  pads() {
    return readPads();
  },
};

function setInputType(type) {
  if (input.type === type) return;
  input.type = type;
  document.body.dataset.input = type;
  if (type !== 'gamepad') setActivePad(null);
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
  else bus.emit('action', { action, source });
}

function isTextField(el) {
  return el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button'].includes(el.type)));
}

// ---------- Tastatur ----------
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
    if (action === 'left' || action === 'right' || (action === 'accept' && ev.key === ' ') || (action === 'back' && ev.key === 'Backspace')) {
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

// ---------- Controller ----------
const padState = new Map();
let lastFrame = performance.now();

export function readPads() {
  const raw = navigator.getGamepads ? navigator.getGamepads() : [];
  const out = [];
  for (const p of raw) {
    const n = normalizePad(p);
    if (n) out.push(n);
  }
  return out;
}

function activatePad(pad) {
  setActivePad(pad.index);
  if (input.padType !== pad.type || input.padName !== pad.name) {
    input.padType = pad.type;
    input.padName = pad.name;
    document.body.dataset.pad = pad.type;
    bus.emit('input-type', 'gamepad');
  }
  setInputType('gamepad');
}

function pollPads(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  const deadzone = Math.max(0.08, Math.min(0.6, prefs.get('deadzone') ?? 0.2));

  for (const pad of readPads()) {
    let st = padState.get(pad.index);
    if (!st) {
      st = { pressed: [], since: [], held: [], lastRepeat: [], dir: null, dirSince: 0, dirLast: 0 };
      padState.set(pad.index, st);
    }
    const map = buttonActions(pad.type);

    pad.buttons.forEach((b, i) => {
      if (i >= BTN.UP && i <= BTN.RIGHT) return; // Steuerkreuz: siehe Richtungslogik
      const pressed = b.pressed;
      const was = st.pressed[i];
      st.pressed[i] = pressed;
      const m = map[i];
      if (!m) return;
      if (pressed && !was) {
        unlockAudio();
        activatePad(pad);
        st.since[i] = now;
        st.held[i] = false;
        st.lastRepeat[i] = now;
        // Tasten mit Halten-Funktion lösen erst beim Loslassen (oder nach Haltezeit) aus
        if (!m.hold) dispatch(m.tap, 'gamepad');
      } else if (pressed && was) {
        if (m.hold && !st.held[i] && now - st.since[i] >= HOLD_MS) {
          st.held[i] = true;
          dispatch(m.hold, 'gamepad');
        } else if (m.repeat && now - st.since[i] > REPEAT_DELAY && now - st.lastRepeat[i] > 140) {
          st.lastRepeat[i] = now;
          dispatch(m.tap, 'gamepad');
        }
      } else if (!pressed && was) {
        if (m.hold && !st.held[i]) dispatch(m.tap, 'gamepad');
      }
    });

    // Linker Stick
    const [lx, ly, lmag] = applyDeadzone(pad.axes[0], pad.axes[1], deadzone);
    if (input.stickMode === 'cursor' && lmag > 0) {
      activatePad(pad);
      bus.emit('cursor', { x: lx, y: ly, mag: lmag, dt });
    }

    // Richtung aus Steuerkreuz oder (im Navigationsmodus) linkem Stick, mit Wiederholung beim Halten
    let dir = null;
    const b = pad.buttons;
    if (b[BTN.UP].pressed) dir = 'up';
    else if (b[BTN.DOWN].pressed) dir = 'down';
    else if (b[BTN.LEFT].pressed) dir = 'left';
    else if (b[BTN.RIGHT].pressed) dir = 'right';
    else if (input.stickMode === 'nav' && lmag > 0.45) {
      dir = Math.abs(lx) > Math.abs(ly) ? (lx > 0 ? 'right' : 'left') : ly > 0 ? 'down' : 'up';
    }
    if (dir !== st.dir) {
      st.dir = dir;
      st.dirSince = now;
      st.dirLast = now;
      if (dir) {
        unlockAudio();
        activatePad(pad);
        dispatch(dir, 'gamepad');
      }
    } else if (dir) {
      const held = now - st.dirSince;
      const interval = held > 1400 ? 60 : 110;
      if (held > REPEAT_DELAY && now - st.dirLast > interval) {
        st.dirLast = now;
        dispatch(dir, 'gamepad');
      }
    }

    // Rechter Stick: analoges Scrollen (beschleunigt bei Vollausschlag)
    const [rx, ry, rmag] = applyDeadzone(pad.axes[2], pad.axes[3], deadzone);
    if (rmag > 0) {
      activatePad(pad);
      const speed = 300 + 2400 * rmag * rmag;
      bus.emit('scroll', { dx: rx * speed * dt, dy: ry * speed * dt });
    }

    input.analog = { lt: pad.buttons[BTN.LT].value, rt: pad.buttons[BTN.RT].value };
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
      if (ev.pointerType === 'mouse' && Math.abs(ev.movementX) + Math.abs(ev.movementY) > 2) setInputType('mouse');
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
    const pad = normalizePad(ev.gamepad);
    if (!pad) return;
    input.padType = pad.type;
    input.padName = pad.name;
    document.body.dataset.pad = pad.type;
    bus.emit('gamepad', { connected: true, ...pad });
  });
  window.addEventListener('gamepaddisconnected', (ev) => {
    padState.delete(ev.gamepad.index);
    bus.emit('gamepad', { connected: false, name: padName(ev.gamepad.id) });
    if (!readPads().length && input.type === 'gamepad') setInputType('mouse');
  });
  requestAnimationFrame(pollPads);
}
