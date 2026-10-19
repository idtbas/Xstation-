// Unterstützte Geräte: Desktop-Computer – und iPads, solange ein Controller verbunden ist.
// Smartphones und Tablets anderer Hersteller erhalten nur einen Hinweis.

import { h, icon } from './dom.js';
import { logoFull } from '../ui/logo.js';

export function deviceKind(nav = navigator) {
  const ua = nav.userAgent || '';
  // iPadOS meldet sich seit Version 13 als Mac – erkennbar an Touch-Unterstützung
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1)) return 'ipad';
  if (nav.userAgentData?.mobile) return 'mobile';
  if (/Android|iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|IEMobile|Mobile Safari|Silk|Kindle|Tablet/i.test(ua)) return 'mobile';
  return 'desktop';
}

export function isMobileDevice(nav = navigator) {
  return deviceKind(nav) === 'mobile';
}

export function renderDesktopOnly(root) {
  root.append(
    h(
      'div.desktop-only',
      h('div.stage-bg'),
      h(
        'div.do-card',
        logoFull({ size: '2.4rem' }),
        h('h1', 'Gerät nicht unterstützt'),
        h('p', 'X-Station läuft auf PC und Mac – und auf dem iPad, sobald ein Controller verbunden ist.'),
        h('p.do-small', 'Smartphones und Tablets anderer Hersteller werden nicht unterstützt.'),
      ),
    ),
  );
}

function connectedPads() {
  return [...(navigator.getGamepads?.() || [])].filter((p) => p && p.connected !== false);
}

function padGate(title, text) {
  return h(
    'div.desktop-only.pad-gate',
    h('div.stage-bg'),
    h(
      'div.do-card',
      logoFull({ size: '2.4rem' }),
      h('div.pg-icon', icon('gamepad-2')),
      h('h1', title),
      h('p', text),
      h('p.do-small.pg-pulse', 'Drücke eine beliebige Taste am Controller'),
    ),
  );
}

// iPad: App erst starten, wenn ein Controller verbunden ist.
export function waitForController(root) {
  return new Promise((resolve) => {
    if (connectedPads().length) return resolve();
    const gate = padGate('Controller verbinden', 'Auf dem iPad läuft X-Station nur mit Controller. Verbinde einen Xbox- oder anderen Controller per Bluetooth (Einstellungen › Bluetooth).');
    root.append(gate);
    const check = () => {
      if (!connectedPads().length) return;
      clearInterval(timer);
      window.removeEventListener('gamepadconnected', check);
      gate.remove();
      resolve();
    };
    const timer = setInterval(check, 300);
    window.addEventListener('gamepadconnected', check);
  });
}

// iPad: Wird der letzte Controller getrennt, sperrt ein Hinweis die Oberfläche, bis wieder einer da ist.
export function watchController(root) {
  let gate = null;
  const update = () => {
    if (document.hidden) return;
    const has = connectedPads().length > 0;
    if (!has && !gate) {
      gate = padGate('Controller getrennt', 'X-Station ist pausiert. Verbinde deinen Controller wieder, um weiterzumachen.');
      gate.classList.add('overlay');
      root.append(gate);
    } else if (has && gate) {
      gate.remove();
      gate = null;
    }
  };
  window.addEventListener('gamepaddisconnected', () => setTimeout(update, 100));
  window.addEventListener('gamepadconnected', update);
  setInterval(update, 1000);
}
