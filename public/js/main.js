// X-Station – Einstiegspunkt

import { applyPrefs, bus } from './core/store.js';
import { initInput } from './core/input.js';
import { screens } from './core/screens.js';
import { api } from './core/api.js';
import { initHints } from './ui/hints.js';
import { initToasts } from './ui/toast.js';
import { initDialogs } from './ui/dialog.js';
import { powerScreen } from './apps/power.js';
import { bootScreen } from './apps/boot.js';
import { termsScreen } from './apps/terms.js';
import { usersScreen, loginScreen, registerScreen } from './apps/users.js';
import { afterBoot } from './apps/flow.js';
import { registerApps } from './apps/registry.js';
import { toggleControlCenter, toggleGuide } from './apps/overlays.js';

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
    const inSession = !['power', 'boot', 'terms', 'users', 'login', 'register', 'rest'].includes(screens.current()?.name);
    if (action === 'home' && inSession) return toggleControlCenter();
    if (action === 'guide' && inSession) return toggleGuide();
    screens.current()?.instance.onAction?.(action);
  });

  await api.init();

  const params = new URLSearchParams(location.search);
  if (params.get('boot') === 'skip') afterBoot();
  else screens.go('power', {}, { transition: 'none' });
}

main();
