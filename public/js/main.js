// X-Station – Einstiegspunkt

import { applyPrefs, bus, pushRecent } from './core/store.js';
import { initInput, input } from './core/input.js';
import { nav } from './core/focus.js';
import { screens } from './core/screens.js';
import { api } from './core/api.js';
import { initHints } from './ui/hints.js';
import { initToasts, toast } from './ui/toast.js';
import { initDialogs } from './ui/dialog.js';
import { powerScreen } from './apps/power.js';
import { bootScreen } from './apps/boot.js';
import { termsScreen } from './apps/terms.js';
import { usersScreen, loginScreen, registerScreen } from './apps/users.js';
import { afterBoot, signOut } from './apps/flow.js';
import { registerApps } from './apps/registry.js';
import { toggleControlCenter, toggleGuide, openControlCenter } from './apps/overlays.js';
import { keyboardForInput } from './ui/osk.js';
import { logoMark } from './ui/logo.js';
import { isMobileDevice, renderDesktopOnly } from './core/device.js';

const SYSTEM_SCREENS = ['power', 'boot', 'terms', 'users', 'login', 'register', 'rest'];

function scrollerForFocus() {
  const cur = nav.current;
  const root = nav.top()?.root;
  return cur?.closest('.scroll-y, .home-scroll, [data-scroll]') || root?.querySelector('.scroll-y, .home-scroll') || null;
}

function pageScroll(dir) {
  const s = scrollerForFocus();
  s?.scrollBy({ top: dir * s.clientHeight * 0.8, behavior: 'smooth' });
}

async function main() {
  applyPrefs();
  if (isMobileDevice()) {
    document.getElementById('app').replaceChildren();
    renderDesktopOnly(document.getElementById('app'));
    return;
  }
  initInput();
  const overlays = document.getElementById('overlays');
  initHints(document.getElementById('hints'));
  initToasts(document.getElementById('toasts'), overlays);
  initDialogs(overlays);
  screens.init(document.getElementById('screens'));

  screens.register('power', powerScreen);
  screens.register('boot', bootScreen);
  screens.register('terms', termsScreen);
  screens.register('users', usersScreen);
  screens.register('login', loginScreen);
  screens.register('register', registerScreen);
  registerApps(screens);

  bus.on('action', ({ action, source }) => {
    const cur = screens.current();
    const inSession = cur && !SYSTEM_SCREENS.includes(cur.name);
    if (action === 'cc') return inSession && toggleControlCenter();
    if (action === 'guide') return inSession && toggleGuide();
    if (action === 'power') return inSession && openControlCenter({ pop: 'power' });
    // Bildschirm-Aktionen nur, wenn kein Overlay (Guide, Dialog …) darüber liegt
    if (cur && nav.top() === cur.layer && cur.instance.onAction?.(action, source)) return;
    if (action === 'lt' || action === 'rt') pageScroll(action === 'rt' ? 1 : -1);
  });

  // Rechter Stick / LT / RT: den Bereich unter dem Fokus scrollen
  bus.on('scroll', ({ dx, dy }) => {
    const cur = screens.current();
    if (cur && nav.top() === cur.layer && cur.instance.onScroll?.(dx, dy)) return;
    scrollerForFocus()?.scrollBy({ top: dy, behavior: 'instant' });
  });

  // Textfelder: mit dem Controller öffnet sich die Bildschirmtastatur
  bus.on('text-activate', (el) => {
    if (input.type === 'gamepad') keyboardForInput(el);
    else el.focus();
  });

  bus.on('gamepad', (pad) => {
    if (pad.connected) {
      toast({
        title: `${pad.name} verbunden`,
        body: pad.type === 'playstation' ? 'PS-Taste: Control Center · Create: Guide' : 'View: Control Center · Xbox-Taste: Guide · Menu: Optionen',
        iconName: 'gamepad-2',
        force: true,
      });
    } else {
      toast({ title: `${pad.name} getrennt`, iconName: 'gamepad-2', force: true, sound: 'back' });
    }
  });

  // X-Station-Taste für Maus/Touch: Klick = Control Center, Rechtsklick = Guide
  const fab = document.createElement('button');
  fab.className = 'xs-fab';
  fab.setAttribute('aria-label', 'Control Center öffnen');
  fab.title = 'Control Center (Rechtsklick: Guide)';
  fab.append(logoMark({ size: '2rem' }));
  fab.addEventListener('click', () => toggleControlCenter());
  fab.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    toggleGuide();
  });
  document.getElementById('app').append(fab);

  // „Zuletzt verwendet“ für Control Center & Guide
  bus.on('screen', ({ name, params, instance }) => {
    if (instance.recent) pushRecent({ id: name, params, ...instance.recent });
    fab.style.display = SYSTEM_SCREENS.includes(name) ? 'none' : '';
    document.body.dataset.screen = name;
  });

  // Sitzung auf dem Server abgelaufen → zurück zur Benutzerauswahl
  bus.on('session-expired', () => {
    toast({ title: 'Sitzung abgelaufen', body: 'Bitte melde dich erneut an.', iconName: 'log-out', force: true });
    signOut();
  });

  await api.init();

  const params = new URLSearchParams(location.search);
  if (params.get('boot') === 'skip') afterBoot();
  else screens.go('power', {}, { transition: 'none' });
}

main();
