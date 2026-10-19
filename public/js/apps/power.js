// Ausgeschalteter Zustand – erster Klick/Tastendruck schaltet ein (und erlaubt Audio).

import { h, icon, wait } from '../core/dom.js';
import { screens } from '../core/screens.js';
import { input } from '../core/input.js';
import { play, unlockAudio } from '../core/sound.js';
import { DISCLAIMER_SHORT } from '../data/legal.js';

export function powerScreen() {
  let done = false;
  const btn = h('button.power-btn.nav', { 'aria-label': 'X-Station einschalten', dataset: { silent: '' } }, icon('power'));
  const el = h(
    'div.power-screen',
    btn,
    h('div.power-label', 'X-Station einschalten'),
    h('div.power-sub', 'Klicke oder drücke eine beliebige Taste'),
    h('div.power-foot', DISCLAIMER_SHORT),
  );

  async function powerOn() {
    if (done) return;
    done = true;
    unlockAudio();
    play('power');
    btn.classList.add('pressing');
    await wait(650);
    screens.go('boot', {}, { reset: true, transition: 'none' });
  }
  btn.addEventListener('click', powerOn);

  let release = null;
  return {
    el,
    hints: [['accept', 'Einschalten']],
    initialFocus: () => btn,
    onShow() {
      release = input.intercept(() => {
        powerOn();
        return true;
      });
    },
    onHide() {
      release?.();
    },
    onBack: () => true,
  };
}
