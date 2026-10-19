// Controller-Test: zeigt alle Tasten, Sticks und Trigger live an (eigene Zeichnung).
// Beenden: B eine Sekunde halten, Esc oder „Schließen“.

import { h, icon, wait } from '../core/dom.js';
import { nav } from '../core/focus.js';
import { input } from '../core/input.js';
import { play } from '../core/sound.js';
import { rumble, canTriggerRumble } from '../core/haptics.js';
import { BTN } from '../core/gamepad-map.js';
import { pushHints, popHints } from './hints.js';

const SVG = `
<svg viewBox="0 0 600 400" class="pt-svg" aria-hidden="true">
  <defs>
    <linearGradient id="ptBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a2f3a"/><stop offset="1" stop-color="#171a21"/>
    </linearGradient>
  </defs>
  <g class="pt-trig" data-b="${BTN.LT}"><rect x="138" y="8" width="84" height="44" rx="12" class="pt-trig-bg"/><rect x="138" y="8" width="84" height="44" rx="12" class="pt-fill"/><text x="180" y="36">LT</text></g>
  <g class="pt-trig" data-b="${BTN.RT}"><rect x="378" y="8" width="84" height="44" rx="12" class="pt-trig-bg"/><rect x="378" y="8" width="84" height="44" rx="12" class="pt-fill"/><text x="420" y="36">RT</text></g>
  <g class="pt-btn" data-b="${BTN.LB}"><rect x="118" y="60" width="124" height="24" rx="12"/><text x="180" y="77">LB</text></g>
  <g class="pt-btn" data-b="${BTN.RB}"><rect x="358" y="60" width="124" height="24" rx="12"/><text x="420" y="77">RB</text></g>
  <path class="pt-body" d="M150 88 C 108 88 80 108 66 148 L 30 282 C 18 334 52 372 98 362 C 128 355 148 322 168 292 L 200 254 L 400 254 L 432 292 C 452 322 472 355 502 362 C 548 372 582 334 570 282 L 534 148 C 520 108 492 88 450 88 Z"/>
  <g class="pt-stick" data-b="${BTN.LS}" data-axes="0"><circle cx="178" cy="152" r="36" class="pt-well"/><circle cx="178" cy="152" r="24" class="pt-knob"/><text x="178" y="157">L</text></g>
  <g class="pt-stick" data-b="${BTN.RS}" data-axes="2"><circle cx="372" cy="228" r="36" class="pt-well"/><circle cx="372" cy="228" r="24" class="pt-knob"/><text x="372" y="233">R</text></g>
  <g class="pt-btn" data-b="${BTN.UP}"><rect x="216" y="196" width="26" height="28" rx="5"/></g>
  <g class="pt-btn" data-b="${BTN.DOWN}"><rect x="216" y="248" width="26" height="28" rx="5"/></g>
  <g class="pt-btn" data-b="${BTN.LEFT}"><rect x="188" y="223" width="28" height="26" rx="5"/></g>
  <g class="pt-btn" data-b="${BTN.RIGHT}"><rect x="242" y="223" width="28" height="26" rx="5"/></g>
  <g class="pt-btn pt-face" data-b="${BTN.Y}" style="--c:#f5c518"><circle cx="440" cy="118" r="17"/><text x="440" y="124">Y</text></g>
  <g class="pt-btn pt-face" data-b="${BTN.X}" style="--c:#3b8cff"><circle cx="406" cy="152" r="17"/><text x="406" y="158">X</text></g>
  <g class="pt-btn pt-face" data-b="${BTN.B}" style="--c:#ff5a4f"><circle cx="474" cy="152" r="17"/><text x="474" y="158">B</text></g>
  <g class="pt-btn pt-face" data-b="${BTN.A}" style="--c:#3ddc4a"><circle cx="440" cy="186" r="17"/><text x="440" y="192">A</text></g>
  <g class="pt-btn" data-b="${BTN.VIEW}"><rect x="252" y="140" width="30" height="20" rx="10"/></g>
  <g class="pt-btn" data-b="${BTN.MENU}"><rect x="318" y="140" width="30" height="20" rx="10"/></g>
  <g class="pt-btn" data-b="${BTN.SHARE}"><rect x="288" y="174" width="24" height="14" rx="7"/></g>
  <g class="pt-btn pt-home" data-b="${BTN.HOME}"><circle cx="300" cy="110" r="19"/></g>
</svg>`;

const NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', '↑', '↓', '←', '→', 'Xbox', 'Share'];

let open = false;

export function openPadTest() {
  if (open) return;
  open = true;
  const svgWrap = h('div.pt-pad', { html: SVG });
  const title = h('div.pt-name');
  const sub = h('div.pt-sub');
  const values = h('div.pt-values');
  const pressedList = h('div.pt-pressed');
  const exitBar = h('div.pt-exit', h('div'));
  const vibBtn = h('button.btn.nav', icon('zap'), 'Vibration testen');
  const closeBtn = h('button.btn.btn-primary.nav', icon('x'), 'Schließen');
  const root = h(
    'div.pt-root',
    h(
      'div.pt-panel',
      h('div.pt-head', h('div', h('h2', 'Controller testen'), title, sub), h('div.pt-actions', vibBtn, closeBtn)),
      svgWrap,
      values,
      pressedList,
      h('div.pt-foot', h('span', 'B gedrückt halten zum Beenden · Menu: Vibration testen'), exitBar),
    ),
  );
  document.getElementById('overlays').append(root);
  const layer = nav.pushLayer(root, { name: 'padtest', onBack: () => (close(), true), initial: () => closeBtn });
  pushHints([]);
  play('open');

  const testVibration = () => {
    const pad = input.pads()[0];
    if (pad) rumble('test', { force: true, index: pad.index });
  };
  vibBtn.addEventListener('click', testVibration);
  closeBtn.addEventListener('click', () => close());

  // Alle Controller-Aktionen abfangen, damit nichts im Hintergrund passiert
  const release = input.intercept((action, source) => {
    if (source !== 'gamepad') {
      if (action === 'back') close();
      return action !== 'accept' && !['left', 'right', 'up', 'down'].includes(action);
    }
    if (action === 'menu') testVibration();
    return true;
  });

  const els = {};
  svgWrap.querySelectorAll('[data-b]').forEach((g) => (els[g.dataset.b] = g));
  let bSince = 0;
  let raf = 0;

  function frame(now) {
    if (!open) return;
    const pad = input.pads()[0];
    if (!pad) {
      title.textContent = 'Kein Controller erkannt';
      sub.textContent = 'Verbinde einen Xbox-Controller per USB oder Bluetooth und drücke eine Taste.';
      values.textContent = '';
      pressedList.textContent = '';
      raf = requestAnimationFrame(frame);
      return;
    }
    title.textContent = pad.name;
    sub.textContent = `Layout: ${pad.layout} · ${pad.actuator ? (canTriggerRumble(pad.index) ? 'Vibration & Trigger-Vibration' : 'Vibration') : 'keine Vibration'} · Index ${pad.index}`;
    pad.buttons.forEach((b, i) => {
      const g = els[i];
      if (!g) return;
      g.classList.toggle('on', b.pressed);
      if (i === BTN.LT || i === BTN.RT) {
        const fill = g.querySelector('.pt-fill');
        const hgt = 44 * b.value;
        fill.setAttribute('y', String(8 + 44 - hgt));
        fill.setAttribute('height', String(Math.max(0.01, hgt)));
      }
    });
    for (const [b, ax] of [
      [BTN.LS, 0],
      [BTN.RS, 2],
    ]) {
      const knob = els[b]?.querySelector('.pt-knob');
      const label = els[b]?.querySelector('text');
      const dx = pad.axes[ax] * 18;
      const dy = pad.axes[ax + 1] * 18;
      knob?.setAttribute('transform', `translate(${dx} ${dy})`);
      label?.setAttribute('transform', `translate(${dx} ${dy})`);
    }
    const f = (v) => (v >= 0 ? ' ' : '') + v.toFixed(2);
    values.textContent = `L-Stick (${f(pad.axes[0])}, ${f(pad.axes[1])})   R-Stick (${f(pad.axes[2])}, ${f(pad.axes[3])})   LT ${pad.buttons[BTN.LT].value.toFixed(2)}   RT ${pad.buttons[BTN.RT].value.toFixed(2)}`;
    const pressed = pad.buttons.map((b, i) => (b.pressed ? NAMES[i] : null)).filter(Boolean);
    pressedList.textContent = pressed.length ? `Gedrückt: ${pressed.join(' + ')}` : 'Drücke eine beliebige Taste';

    // B halten = Beenden
    if (pad.buttons[BTN.B].pressed) {
      bSince ||= now;
      const p = Math.min(1, (now - bSince) / 1000);
      exitBar.firstChild.style.width = `${p * 100}%`;
      if (p >= 1) return close();
    } else {
      bSince = 0;
      exitBar.firstChild.style.width = '0';
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  async function close() {
    if (!open) return;
    open = false;
    cancelAnimationFrame(raf);
    release();
    nav.popLayer(layer);
    popHints();
    play('close');
    root.classList.add('out');
    await wait(240);
    root.remove();
  }
}
