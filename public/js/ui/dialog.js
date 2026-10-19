// Modale Dialoge (PS5-Stil), vollständig mit Controller bedienbar.

import { h, icon, wait } from '../core/dom.js';
import { nav } from '../core/focus.js';
import { play } from '../core/sound.js';

let overlayRoot = null;

export function initDialogs(root) {
  overlayRoot = root;
}

// actions: [{ label, value, primary, danger }]
export function dialog({ title, text = [], iconName = null, code = null, actions = [{ label: 'OK', value: true, primary: true }], content = null, cancelValue = null, initial = null, wide = false }) {
  return new Promise((resolve) => {
    let layer = null;
    const close = async (value) => {
      if (!backdrop.isConnected || backdrop.classList.contains('out')) return;
      backdrop.classList.add('out');
      nav.popLayer(layer);
      await wait(260);
      backdrop.remove();
      resolve(value);
    };
    const buttons = actions.map((a) =>
      h(
        `button.btn.nav${a.primary ? '.btn-primary' : ''}${a.danger ? '.btn-danger' : ''}`,
        { onclick: () => close(a.value) },
        a.icon ? icon(a.icon) : null,
        a.label,
      ),
    );
    const box = h(
      'div.dialog',
      { role: 'dialog', 'aria-modal': 'true', style: wide ? { width: 'min(56rem, 94vw)' } : undefined },
      iconName ? h('div.dlg-icon', icon(iconName)) : null,
      h('h2', title),
      ...[].concat(text).map((t) => h('p', t)),
      content,
      code ? h('div.code', code) : null,
      h('div.actions', { dataset: { group: '' } }, buttons),
    );
    const backdrop = h('div.dialog-backdrop', { onclick: (ev) => ev.target === backdrop && close(cancelValue) }, box);
    overlayRoot.append(backdrop);
    play('open');
    layer = nav.pushLayer(backdrop, {
      name: 'dialog',
      onBack: () => close(cancelValue),
      initial: () => initial?.() || buttons.find((b, i) => actions[i].primary) || buttons[0],
    });
  });
}

export function confirmDialog(title, text, { confirm = 'Bestätigen', danger = false, iconName = null } = {}) {
  return dialog({
    title,
    text,
    iconName,
    actions: [
      { label: 'Abbrechen', value: false },
      { label: confirm, value: true, primary: !danger, danger },
    ],
    cancelValue: false,
  });
}

export function errorDialog(title, text, code) {
  play('error');
  return dialog({ title, text, code, iconName: 'info', actions: [{ label: 'OK', value: true, primary: true }] });
}
