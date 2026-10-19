// Registriert alle System-Apps als Bildschirme.
import { h } from '../core/dom.js';

export function registerApps(screens) {
  screens.register('home', () => ({ el: h('div', 'Startseite folgt') }));
}
