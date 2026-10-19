// X-Station – Einstiegspunkt

import { applyPrefs, bus, pushRecent } from './core/store.js';
import { initInput } from './core/input.js';
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
import { toggleControlCenter, toggleGuide } from './apps/overlays.js';
import { logoMark } from './ui/logo.js';

const SYSTEM_SCREENS = ['power', 'boot', 'terms', 'users', 'login', 'register', 'rest'];

async function main() {
  applyPrefs();
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

  bus.on('action', (action) => {
    const inSession = !SYSTEM_SCREENS.includes(screens.current()?.name);
    if (action === 'home' && inSession) return toggleControlCenter();
    if (action === 'guide' && inSession) return toggleGuide();
    screens.current()?.instance.onAction?.(action);
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
