// Ablauf zwischen den Systemzuständen: Boot → Bedingungen → Benutzer → Startseite.

import { screens } from '../core/screens.js';
import { load } from '../core/store.js';
import { endSession } from '../core/system.js';
import { TERMS_VERSION } from '../data/legal.js';
import { closeOverlays } from './overlays.js';
import { music } from '../core/music.js';

export function termsAccepted() {
  return load('xs.terms', null)?.version === TERMS_VERSION;
}

export function afterBoot() {
  if (!termsAccepted()) return screens.go('terms', { next: 'users' }, { reset: true, transition: 'fade' });
  return screens.go('users', {}, { reset: true, transition: 'fade' });
}

export function enterHome() {
  return screens.go('home', {}, { reset: true, transition: 'zoom' });
}

export async function signOut() {
  closeOverlays();
  music.stop();
  await endSession();
  return screens.go('users', {}, { reset: true, transition: 'fade' });
}

export async function powerOff() {
  closeOverlays();
  music.stop();
  await endSession({ forget: false });
  return screens.go('power', {}, { reset: true, transition: 'fade' });
}

export async function restart() {
  closeOverlays();
  music.stop();
  await endSession({ forget: false });
  return screens.go('boot', {}, { reset: true, transition: 'fade' });
}

export function restMode() {
  closeOverlays();
  return screens.go('rest', {}, { transition: 'fade' });
}
