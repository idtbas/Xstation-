// Registriert alle System-Apps als Bildschirme.
import { homeScreen } from './home.js';
import { settingsScreen } from './settings.js';
import { browserScreen } from './browser.js';
import { storeScreen, productScreen, libraryScreen } from './store-apps.js';
import { musicScreen, achievementsScreen, searchScreen, restScreen } from './media-apps.js';

export function registerApps(screens) {
  screens.register('home', homeScreen);
  screens.register('settings', settingsScreen);
  screens.register('browser', browserScreen);
  screens.register('store', storeScreen);
  screens.register('product', productScreen);
  screens.register('library', libraryScreen);
  screens.register('music', musicScreen);
  screens.register('achievements', achievementsScreen);
  screens.register('search', searchScreen);
  screens.register('rest', restScreen);
}
