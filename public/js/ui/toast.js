// Benachrichtigungen (PS5-Stil, oben rechts) und Erfolgs-Popup (Xbox-Stil, unten mittig).

import { h, icon, wait } from '../core/dom.js';
import { play } from '../core/sound.js';
import { prefs } from '../core/store.js';
import { avatarEl } from './avatars.js';

let toastRoot = null;
let overlayRoot = null;
const achvQueue = [];
let achvBusy = false;

export function initToasts(toasts, overlays) {
  toastRoot = toasts;
  overlayRoot = overlays;
}

export function toast({ title, body = '', iconName = 'bell', avatar = null, sound = 'notify', duration = 5000, force = false }) {
  if (!toastRoot) return;
  if (!force && !prefs.get('toasts')) return;
  const visual = avatar ? avatarEl(avatar, { size: '3rem' }) : h('div.t-icon', icon(iconName));
  const el = h('div.toast', visual, h('div', h('div.t-title', title), body ? h('div.t-body', body) : null));
  toastRoot.prepend(el);
  while (toastRoot.children.length > 4) toastRoot.lastChild.remove();
  if (sound) play(sound);
  setTimeout(async () => {
    el.classList.add('out');
    await wait(380);
    el.remove();
  }, duration);
}

export function achievementToast(achv) {
  achvQueue.push(achv);
  if (!achvBusy) runAchievements();
}

async function runAchievements() {
  achvBusy = true;
  while (achvQueue.length) {
    const a = achvQueue.shift();
    const el = h(
      'div.achv-toast',
      h(
        'div.achv-pill',
        h('div.achv-badge', icon(a.icon || 'trophy')),
        h('div.achv-text', h('div.a1', 'Erfolg freigeschaltet'), h('div.a2', h('b', `${a.points} XP`), a.title)),
      ),
    );
    overlayRoot.append(el);
    play('achievement');
    await wait(4600);
    el.classList.add('out');
    await wait(450);
    el.remove();
    await wait(250);
  }
  achvBusy = false;
}
