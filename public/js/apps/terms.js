// Nutzungsbedingungen – müssen vor der ersten Nutzung akzeptiert werden.

import { h, icon } from '../core/dom.js';
import { screens } from '../core/screens.js';
import { input } from '../core/input.js';
import { nav } from '../core/focus.js';
import { save, store } from '../core/store.js';
import { play } from '../core/sound.js';
import { call } from '../core/api.js';
import { TERMS, TERMS_VERSION, TERMS_DATE, CONSENT_CHECKS } from '../data/legal.js';
import { logoFull } from '../ui/logo.js';
import { dialog } from '../ui/dialog.js';
import { powerOff } from './flow.js';

export function termsScreen({ next = 'users', readOnly = false } = {}) {
  const checks = CONSENT_CHECKS.map(() => false);
  const progress = h('div');
  const doc = h(
    'div.terms-doc.acrylic.scroll-y.nav',
    { tabindex: '0', 'aria-label': 'Nutzungsbedingungen', dataset: { silent: '' } },
    TERMS.map((s) => [h('h3', s.title), s.body.map((p) => h('p', p))]),
  );

  const acceptBtn = h('button.btn.btn-primary.btn-lg.nav.disabled', { 'aria-disabled': 'true' }, icon('check'), 'Akzeptieren');
  const declineBtn = h('button.btn.btn-lg.nav', 'Ablehnen');

  const checkRows = CONSENT_CHECKS.map((text, i) => {
    const row = h('button.check-row.nav', { role: 'checkbox', 'aria-checked': 'false' }, h('span.box', icon('check')), h('span', text));
    row.addEventListener('click', () => {
      checks[i] = !checks[i];
      row.classList.toggle('checked', checks[i]);
      row.setAttribute('aria-checked', String(checks[i]));
      play('toggle');
      const ok = checks.every(Boolean);
      acceptBtn.classList.toggle('disabled', !ok);
      acceptBtn.setAttribute('aria-disabled', String(!ok));
    });
    return row;
  });

  function updateProgress() {
    const max = doc.scrollHeight - doc.clientHeight;
    progress.style.width = `${max > 0 ? Math.min(100, (doc.scrollTop / max) * 100) : 100}%`;
  }
  doc.addEventListener('scroll', updateProgress, { passive: true });

  acceptBtn.addEventListener('click', async () => {
    if (!checks.every(Boolean)) return;
    save('xs.terms', { version: TERMS_VERSION, at: Date.now() });
    if (store.get('user')) {
      try {
        await call.updateMe({ acceptedTerms: TERMS_VERSION });
      } catch {
        /* wird beim nächsten Login nachgeholt */
      }
    }
    if (next === 'back') screens.back();
    else screens.go(next, {}, { reset: next === 'users', transition: 'zoom' });
  });

  declineBtn.addEventListener('click', async () => {
    if (readOnly) return screens.back();
    const choice = await dialog({
      title: 'Zustimmung erforderlich',
      text: 'Ohne Zustimmung zu den Nutzungsbedingungen kann X-Station nicht verwendet werden.',
      iconName: 'shield',
      actions: [
        { label: 'Ausschalten', value: 'off', icon: 'power' },
        { label: 'Zurück zu den Bedingungen', value: 'back', primary: true },
      ],
      cancelValue: 'back',
    });
    if (choice === 'off') powerOff();
  });

  const main = readOnly
    ? h('div.terms-main', doc, h('div.terms-progress', progress), h('div.terms-actions', { dataset: { group: '' } }, h('button.btn.btn-lg.nav', { onclick: () => screens.back() }, icon('arrow-left'), 'Zurück')))
    : h(
        'div.terms-main',
        doc,
        h('div.terms-progress', progress),
        h('div', { style: { display: 'grid', gap: '0.75rem' }, dataset: { group: '' } }, checkRows),
        h('div.terms-actions', { dataset: { group: '' } }, declineBtn, acceptBtn),
      );

  const el = h(
    'div.terms-screen',
    h('div.stage-bg'),
    h(
      'div.terms-side',
      logoFull({ size: '2.6rem' }),
      h('h1', 'Nutzungs­bedingungen'),
      h('div.terms-meta', h('span.pill-tag.blue', `Version ${TERMS_VERSION}`), h('span.pill-tag', `Stand: ${TERMS_DATE}`)),
      h(
        'p',
        readOnly
          ? 'Hier kannst du die Nutzungsbedingungen, denen du zugestimmt hast, jederzeit erneut lesen.'
          : 'Bevor du X-Station verwenden kannst, lies bitte die folgenden Nutzungsbedingungen und bestätige sie.',
      ),
      h(
        'div.terms-warn',
        icon('info'),
        h('div', 'X-Station ist ein inoffizielles Fan-Projekt. Es hat nichts mit PlayStation oder Xbox zu tun und nutzt keine offiziellen Engines oder Betriebssysteme.'),
      ),
    ),
    main,
  );

  let release = null;
  return {
    el,
    hints: [
      ['accept', 'Auswählen'],
      ['back', readOnly ? 'Zurück' : 'Ablehnen'],
    ],
    initialFocus: () => doc,
    onShow() {
      requestAnimationFrame(updateProgress);
      // Auf dem Dokument scrollen Hoch/Runter den Text, bis das Ende erreicht ist.
      release = input.intercept((action) => {
        if (nav.current !== doc) return false;
        if (action === 'down' && doc.scrollTop + doc.clientHeight < doc.scrollHeight - 4) {
          doc.scrollBy({ top: doc.clientHeight * 0.45, behavior: 'smooth' });
          return true;
        }
        if (action === 'up' && doc.scrollTop > 2) {
          doc.scrollBy({ top: -doc.clientHeight * 0.45, behavior: 'smooth' });
          return true;
        }
        return false;
      });
    },
    onHide() {
      release?.();
    },
    onBack: () => {
      if (readOnly) screens.back();
      else declineBtn.click();
      return true;
    },
  };
}
