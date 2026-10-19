// Öffnet System-Apps anhand ihrer ID.
import { screens } from '../core/screens.js';
import { openGuide } from './overlays.js';

const SCREEN_FOR = {
  store: 'store',
  library: 'library',
  browser: 'browser',
  music: 'music',
  achievements: 'achievements',
  settings: 'settings',
};

export function openApp(id, params = {}) {
  if (id === 'friends') return openGuide({ tab: 'friends' });
  if (id === 'home') return screens.go('home', {}, { reset: true });
  const name = SCREEN_FOR[id];
  if (!name) return;
  // Bereits geöffnete App wiederverwenden statt zu stapeln
  if (screens.is(name)) return screens.current().instance.onReopen?.(params);
  return screens.go(name, params);
}
