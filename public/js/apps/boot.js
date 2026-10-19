// Boot-Sequenz: Funken sammeln sich, Lichtexplosion, Logo, „Drücke eine Taste“.

import { h, wait } from '../core/dom.js';
import { input } from '../core/input.js';
import { playBoot, play } from '../core/sound.js';
import { BootFx } from '../ui/bootfx.js';
import { logoFull } from '../ui/logo.js';
import { afterBoot } from './flow.js';

export function bootScreen() {
  const reduced = document.documentElement.dataset.motion === 'reduced';
  const canvas = h('canvas');
  const prompt = h('div.boot-prompt', 'Drücke eine beliebige Taste, um zu starten');
  const el = h(
    'div.boot-screen',
    canvas,
    h('div.shine'),
    h('div.boot-center', h('div.boot-logo', logoFull({ size: '5.5rem' })), prompt),
  );
  const burstAt = reduced ? 0.4 : 2.6;
  let fx = null;
  let ready = false;
  let finished = false;
  let release = null;
  const timers = [];

  const showLogo = () => el.classList.add('show-logo');
  const showPrompt = () => {
    el.classList.add('show-prompt');
    ready = true;
  };

  function finish() {
    if (finished) return;
    finished = true;
    play('select');
    afterBoot();
  }

  return {
    el,
    hints: [['accept', 'Starten']],
    onShow() {
      fx = new BootFx(canvas, {
        burstAt,
        onBurst: () => {
          timers.push(setTimeout(showLogo, reduced ? 0 : 350));
          timers.push(setTimeout(showPrompt, reduced ? 600 : 2300));
        },
      });
      fx.start();
      playBoot({ burstAt });
      release = input.intercept(() => {
        if (ready) finish();
        else if (fx.t < burstAt) fx.skipToBurst();
        else {
          showLogo();
          showPrompt();
        }
        return true;
      });
      el.addEventListener('click', () => {
        if (ready) finish();
        else fx.skipToBurst();
      });
    },
    onHide() {
      release?.();
      timers.forEach(clearTimeout);
      wait(800).then(() => fx?.stop());
    },
    onBack: () => true,
  };
}
