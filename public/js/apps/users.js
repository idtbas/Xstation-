// Benutzerauswahl („Wer benutzt X-Station?“), Anmeldung und Registrierung.

import { h, icon } from '../core/dom.js';
import { screens } from '../core/screens.js';
import { nav } from '../core/focus.js';
import { api, call } from '../core/api.js';
import { accounts, startSession, resumeSession, unlock } from '../core/system.js';
import { clockEl } from '../core/util.js';
import { play } from '../core/sound.js';
import { avatarEl, AVATAR_LIST } from '../ui/avatars.js';
import { logoFull } from '../ui/logo.js';
import { dialog, confirmDialog } from '../ui/dialog.js';
import { achievementToast } from '../ui/toast.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { TERMS_VERSION } from '../data/legal.js';
import { enterHome, powerOff, termsAccepted } from './flow.js';

function modeChip() {
  const local = api.mode === 'local';
  return h(
    'div.mode-chip',
    { class: local ? 'local' : '' },
    h('span.led'),
    local ? 'Lokaler Modus – Konten nur in diesem Browser' : 'Online – verbunden mit dem X-Station-Server',
  );
}

async function loginWithAccount(account) {
  if (account.token) {
    try {
      await resumeSession(account);
      play('select');
      return enterHome();
    } catch (err) {
      if (err.status && err.status !== 401) {
        return dialog({ title: 'Anmeldung nicht möglich', text: err.message, iconName: 'info' });
      }
      accounts.forgetToken(account.id);
    }
  }
  return screens.go('login', { username: account.username });
}

export function usersScreen() {
  const list = accounts.list();
  const cards = list.map((acc, i) => {
    const card = h(
      'button.user-card.nav',
      { style: { animationDelay: `${i * 70}ms` }, 'aria-label': acc.displayName },
      avatarEl(acc.avatar),
      h('div.u-name', acc.displayName),
      h('div.u-sub', `@${acc.username}`),
    );
    card.addEventListener('click', () => loginWithAccount(acc));
    card.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      removeAccount(acc);
    });
    card.dataset.accountId = acc.id;
    return card;
  });

  async function removeAccount(acc) {
    const ok = await confirmDialog(
      'Benutzer entfernen?',
      `${acc.displayName} wird nur von diesem Gerät entfernt. Das Konto selbst bleibt bestehen.`,
      { confirm: 'Entfernen', danger: true },
    );
    if (ok) {
      accounts.remove(acc.id);
      screens.go('users', {}, { replace: true, transition: 'none' });
    }
  }

  const addCard = h(
    'button.user-card.nav',
    { style: { animationDelay: `${cards.length * 70}ms` } },
    h('div.add-circle', icon('plus')),
    h('div.u-name', 'Benutzer hinzufügen'),
  );
  addCard.addEventListener('click', async () => {
    const choice = await dialog({
      title: 'Benutzer hinzufügen',
      text: 'Erstelle ein neues X-Station-Konto oder melde dich mit einem vorhandenen Konto an.',
      iconName: 'user-plus',
      actions: [
        { label: 'Anmelden', value: 'login', icon: 'log-out' },
        { label: 'Neues Konto erstellen', value: 'register', primary: true, icon: 'sparkles' },
      ],
    });
    if (choice === 'login') screens.go('login');
    if (choice === 'register') screens.go('register');
  });

  const powerBtn = h('button.btn.btn-sm.nav', { onclick: () => powerOff() }, icon('power'), 'Ausschalten');

  const el = h(
    'div.users-screen',
    h('div.stage-bg'),
    h('div.users-head', logoFull({ size: '2.2rem' }), clockEl('users-clock')),
    h('h1.users-title', list.length ? 'Wer benutzt X-Station?' : 'Willkommen bei X-Station'),
    h('div.users-row', { dataset: { group: '', trap: '' } }, cards, addCard),
    h('div.users-foot', { dataset: { group: '' } }, powerBtn, modeChip()),
  );

  return {
    el,
    hints: list.length ? [
      ['accept', 'Auswählen'],
      ['x', 'Vom Gerät entfernen'],
    ] : [['accept', 'Auswählen']],
    initialFocus: () => cards[0] || addCard,
    onBack: () => true,
    onAction(action) {
      if ((action === 'x' || action === 'menu') && nav.current?.dataset.accountId) {
        const acc = list.find((a) => a.id === nav.current.dataset.accountId);
        if (acc) removeAccount(acc);
        return true;
      }
      return false;
    },
  };
}

// ---------- Formular-Helfer ----------
function field(label, attrs) {
  const input = h('input.input.nav', { spellcheck: 'false', autocomplete: 'off', ...attrs });
  return { wrap: h('div.field', h('label', label), input), input };
}

function introBlock(title, text) {
  return h('div.form-intro', logoFull({ size: '2.4rem' }), h('h1', title), h('p', text));
}

// ---------- Anmelden ----------
export function loginScreen({ username = '' } = {}) {
  const user = field('Benutzername', { value: username, autocomplete: 'username', maxlength: '16' });
  const pass = field('Passwort', { type: 'password', autocomplete: 'current-password' });
  const error = h('div.form-error');
  const submit = h('button.btn.btn-primary.btn-lg.nav', icon('log-out'), 'Anmelden');
  const toRegister = h('button.link-btn.nav', { onclick: () => screens.go('register', {}, { replace: true }) }, 'Noch kein Konto? Jetzt erstellen');

  async function doLogin() {
    error.textContent = '';
    if (!user.input.value.trim() || !pass.input.value) {
      error.textContent = 'Bitte gib Benutzername und Passwort ein.';
      play('error');
      return;
    }
    submit.classList.add('disabled');
    try {
      const res = await call.login({
        username: user.input.value.trim(),
        password: pass.input.value,
        acceptedTerms: termsAccepted() ? TERMS_VERSION : undefined,
      });
      await startSession(res.token, res.user);
      play('select');
      enterHome();
    } catch (err) {
      error.textContent = err.message;
      play('error');
    } finally {
      submit.classList.remove('disabled');
    }
  }
  submit.addEventListener('click', doLogin);
  user.input.addEventListener('enter', (ev) => {
    ev.preventDefault();
    nav.focus(pass.input, { sound: true });
    pass.input.focus();
  });
  pass.input.addEventListener('enter', (ev) => {
    ev.preventDefault();
    doLogin();
  });

  const el = h(
    'div.form-screen',
    h('div.stage-bg'),
    introBlock('Willkommen zurück', 'Melde dich mit deinem X-Station-Konto an, um deine Freundesliste, Nachrichten und Erfolge zu sehen.'),
    h(
      'div.form-panel.acrylic',
      h('h2', 'Anmelden'),
      user.wrap,
      pass.wrap,
      error,
      h('div.form-actions', { dataset: { group: '' } }, toRegister, submit),
    ),
  );
  return { el, initialFocus: () => (username ? pass.input : user.input) };
}

// ---------- Registrieren ----------
export function registerScreen() {
  let avatar = AVATAR_LIST[Math.floor(Math.random() * AVATAR_LIST.length)].id;
  const display = field('Anzeigename', { maxlength: '24', placeholder: 'So sehen dich deine Freunde' });
  const user = field('Benutzername', { maxlength: '16', placeholder: '3–16 Zeichen', autocomplete: 'username' });
  const pass = field('Passwort', { type: 'password', placeholder: 'Mindestens 8 Zeichen', autocomplete: 'new-password' });
  const pass2 = field('Passwort wiederholen', { type: 'password', autocomplete: 'new-password' });
  const error = h('div.form-error');
  const submit = h('button.btn.btn-primary.btn-lg.nav', icon('sparkles'), 'Konto erstellen');

  const picks = AVATAR_LIST.map((a) => {
    const btn = h('button.avatar-pick.nav', { 'aria-label': `Avatar ${a.icon}`, class: a.id === avatar ? 'selected' : '' }, avatarEl(a.id));
    btn.addEventListener('click', () => {
      avatar = a.id;
      picks.forEach((p) => p.classList.toggle('selected', p === btn));
    });
    return btn;
  });

  async function doRegister() {
    error.textContent = '';
    const username = user.input.value.trim();
    if (!/^[A-Za-z0-9_.-]{3,16}$/.test(username)) {
      error.textContent = 'Der Benutzername muss 3–16 Zeichen lang sein (Buchstaben, Zahlen, _ . -).';
    } else if (pass.input.value.length < 8) {
      error.textContent = 'Das Passwort muss mindestens 8 Zeichen lang sein.';
    } else if (pass.input.value !== pass2.input.value) {
      error.textContent = 'Die Passwörter stimmen nicht überein.';
    }
    if (error.textContent) {
      play('error');
      return;
    }
    submit.classList.add('disabled');
    try {
      const res = await call.register({
        username,
        password: pass.input.value,
        displayName: display.input.value.trim() || username,
        avatar,
        acceptedTerms: TERMS_VERSION,
      });
      await startSession(res.token, res.user);
      enterHome();
      setTimeout(() => achievementToast(ACHIEVEMENTS.find((a) => a.id === 'welcome')), 1600);
      unlock('welcome');
    } catch (err) {
      error.textContent = err.message;
      play('error');
    } finally {
      submit.classList.remove('disabled');
    }
  }
  submit.addEventListener('click', doRegister);
  const chain = [display, user, pass, pass2];
  chain.forEach((f, i) =>
    f.input.addEventListener('enter', (ev) => {
      ev.preventDefault();
      const next = chain[i + 1];
      if (next) {
        nav.focus(next.input, { sound: true });
        next.input.focus();
      } else doRegister();
    }),
  );

  const el = h(
    'div.form-screen',
    h('div.stage-bg'),
    introBlock(
      'Neues Konto erstellen',
      'Mit einem Konto kannst du Freunde hinzufügen, Nachrichten schreiben und Erfolge sammeln. Andere registrierte Nutzer finden dich über deinen Benutzernamen.',
    ),
    h(
      'div.form-panel.acrylic.scroll-y',
      h('h2', 'Dein Profil'),
      h('div.form-grid', display.wrap, user.wrap, pass.wrap, pass2.wrap),
      h('div.field', h('label', 'Avatar'), h('div.avatar-grid', { dataset: { group: '' } }, picks)),
      error,
      h(
        'div.form-actions',
        { dataset: { group: '' } },
        h('button.link-btn.nav', { onclick: () => screens.go('login', {}, { replace: true }) }, 'Ich habe schon ein Konto'),
        submit,
      ),
    ),
  );
  return { el, initialFocus: () => display.input };
}
