// „Spielstart“ – zeigt die PS5-artige Startsequenz und erklärt dann freundlich,
// dass X-Station keine Spiele ausführt.

import { h, wait } from '../core/dom.js';
import { nav } from '../core/focus.js';
import { play } from '../core/sound.js';
import { unlock, setActivity } from '../core/system.js';
import { gameArt } from '../ui/art.js';
import { dialog } from '../ui/dialog.js';

let busy = false;

export async function launchGame(game) {
  if (busy) return;
  busy = true;
  const overlays = document.getElementById('overlays');
  const el = h(
    'div.launch',
    h('div.l-art', { style: { backgroundImage: `url("${gameArt(game, 'hero')}")` } }),
    h('div.l-shade'),
    h('div.l-title', { class: `t-${game.titleStyle}` }, game.title),
    h('div.l-spin', h('div.spinner'), 'Wird gestartet …'),
  );
  overlays.append(el);
  const layer = nav.pushLayer(el, { name: 'launch', onBack: () => true });
  play('launch');
  setActivity(`Versucht, ${game.title} zu starten`);
  await wait(2600);
  el.classList.add('out');
  await wait(400);
  el.remove();
  nav.popLayer(layer);
  busy = false;
  unlock('nice-try');
  play('error');
  await dialog({
    title: 'Spiel kann nicht gestartet werden',
    text: [
      `„${game.title}“ ist ein fiktiver Platzhalter.`,
      'X-Station ist eine reine Benutzeroberfläche im Browser und führt keine Spiele aus. Es werden keine offiziellen Engines oder Betriebssysteme verwendet.',
    ],
    iconName: 'gamepad-2',
    code: 'Fehlercode: XS-0000-GAME',
  });
  setActivity('Startseite');
}
