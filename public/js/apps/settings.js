// Einstellungen: links Kategorien (Xbox), rechts Optionen (PS5-Listen).
// Unter „Info“: Systeminfos, Credits und der Hinweis, dass X-Station nichts mit PlayStation/Xbox zu tun hat.

import { h, icon, clear } from '../core/dom.js';
import { nav } from '../core/focus.js';
import { screens } from '../core/screens.js';
import { input } from '../core/input.js';
import { prefs, store, bus, save } from '../core/store.js';
import { api, call } from '../core/api.js';
import { play } from '../core/sound.js';
import { refreshMe, unlock, setActivity, library, accounts } from '../core/system.js';
import { clockEl, formatDate } from '../core/util.js';
import { rowBtn, toggleRow, slider, label } from '../ui/components.js';
import { avatarEl, AVATAR_LIST } from '../ui/avatars.js';
import { logoFull } from '../ui/logo.js';
import { dialog, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { TERMS_VERSION, TERMS_DATE, DISCLAIMER, CREDITS } from '../data/legal.js';
import { GAMES } from '../data/games.js';
import { SEARCH_ENGINES } from '../data/sites.js';
import { signOut, restart } from './flow.js';

const SECTIONS = [
  { id: 'account', title: 'Konto & Profil', icon: 'user-round', desc: 'Verwalte dein X-Station-Konto, dein Profil und deine Anmeldung.' },
  { id: 'appearance', title: 'Design', icon: 'palette', desc: 'Passe Akzentfarbe und Hintergrund an – PlayStation-Blau, Xbox-Grün oder beides.' },
  { id: 'sound', title: 'Ton', icon: 'volume-2', desc: 'Lautstärke und Systemklänge. Alle Klänge werden live von X-Station erzeugt.' },
  { id: 'notifications', title: 'Benachrichtigungen', icon: 'bell', desc: 'Lege fest, wie X-Station dich über Neuigkeiten informiert.' },
  { id: 'access', title: 'Barrierefreiheit', icon: 'accessibility', desc: 'Bewegungen reduzieren und Text vergrößern.' },
  { id: 'browser', title: 'Browser', icon: 'globe', desc: 'Suchmaschine, Startseite und Datenschutz des eingebauten Browsers.' },
  { id: 'controls', title: 'Steuerung', icon: 'gamepad-2', desc: 'X-Station lässt sich mit Tastatur, Maus und Controller bedienen.' },
  { id: 'system', title: 'System', icon: 'cpu', desc: 'Speicher, Verbindung und Zurücksetzen.' },
  { id: 'info', title: 'Info', icon: 'info', desc: 'Systeminformationen, rechtliche Hinweise und Credits.' },
];

function textDialog({ title, labelText, value = '', type = 'text', maxlength = 24, multiline = false, confirm = 'Speichern' }) {
  const field = multiline
    ? h('textarea.input.nav', { maxlength: String(maxlength), rows: '3' }, value)
    : h('input.input.nav', { type, value, maxlength: String(maxlength), autocomplete: 'off', spellcheck: 'false' });
  return dialog({
    title,
    content: h('div.dlg-form', h('div.field', h('label', labelText), field)),
    actions: [
      { label: 'Abbrechen', value: null },
      { label: confirm, value: 'ok', primary: true },
    ],
    initial: () => field,
  }).then((v) => (v === 'ok' ? field.value : null));
}

export function settingsScreen({ section = 'account' } = {}) {
  let current = SECTIONS.some((s) => s.id === section) ? section : 'account';
  let switchTimer = null;
  const unsubs = [];

  const navRows = SECTIONS.map((s) => {
    const row = rowBtn({ iconName: s.icon, title: s.title, key: `sec-${s.id}` });
    row.dataset.section = s.id;
    row.addEventListener('navfocus', () => {
      clearTimeout(switchTimer);
      switchTimer = setTimeout(() => show(s.id), 110);
    });
    row.addEventListener('click', () => {
      show(s.id);
      const first = nav.focusablesIn(el).find((x) => panel.contains(x));
      if (first) nav.focus(first, { sound: true });
    });
    return row;
  });
  const navEl = h('nav.set-nav.acrylic', { dataset: { group: '', trap: 'y', remember: '' } }, navRows);
  const panel = h('div.set-panel.acrylic.scroll-y');

  function show(id, force = false) {
    if (id === current && panel.childElementCount && !force) return;
    current = id;
    navRows.forEach((r) => r.classList.toggle('current', r.dataset.section === id));
    const sec = SECTIONS.find((s) => s.id === id);
    const keep = panel.contains(nav.current) ? nav.current?.dataset?.key : null;
    clear(panel);
    panel.classList.remove('swap');
    void panel.offsetWidth;
    if (!force) panel.classList.add('swap');
    panel.scrollTop = force ? panel.scrollTop : 0;
    panel.append(h('h2', sec.title), h('p.set-desc', sec.desc), ...RENDER[id]());
    if (keep) {
      const again = panel.querySelector(`[data-key="${CSS.escape(keep)}"]`);
      if (again) nav.focus(again, { silent: true, scroll: false });
    }
    if (id === 'info') unlock('reader');
  }

  const group = (title, ...children) => h('div.set-group', { dataset: { group: '' } }, label(title), children);

  // ---------- Bereiche ----------
  const RENDER = {
    account() {
      const u = store.get('user');
      if (!u) return [];
      return [
        h(
          'div.profile-card',
          avatarEl(u.avatar, { status: u.status === 'invisible' ? 'offline' : u.status }),
          h('div', h('h3', u.displayName), h('div.sub', `@${u.username} · ${u.score} XP · Mitglied seit ${formatDate(u.createdAt)}`), u.bio ? h('div.sub', u.bio) : null),
        ),
        group(
          'Profil',
          rowBtn({
            iconName: 'pencil',
            title: 'Anzeigename',
            end: u.displayName,
            key: 'name',
            onClick: async () => {
              const v = await textDialog({ title: 'Anzeigename ändern', labelText: 'Anzeigename (max. 24 Zeichen)', value: u.displayName });
              if (v != null) await saveMe({ displayName: v });
            },
          }),
          rowBtn({
            iconName: 'file-text',
            title: 'Über mich',
            end: u.bio ? 'Bearbeiten' : 'Hinzufügen',
            key: 'bio',
            onClick: async () => {
              const v = await textDialog({ title: 'Über mich', labelText: 'Kurzer Profiltext (max. 140 Zeichen)', value: u.bio, maxlength: 140, multiline: true });
              if (v != null) await saveMe({ bio: v });
            },
          }),
          rowBtn({ iconName: 'user-round', title: 'Avatar ändern', end: avatarEl(u.avatar, { size: '2.2rem' }), key: 'avatar', onClick: pickAvatar }),
        ),
        group(
          'Sicherheit',
          rowBtn({ iconName: 'lock', title: 'Passwort ändern', key: 'pw', onClick: changePassword }),
          rowBtn({ iconName: 'shield-check', title: 'Nutzungsbedingungen', sub: u.termsAccepted ? `Version ${u.termsAccepted.version} akzeptiert am ${formatDate(u.termsAccepted.at)}` : 'Noch nicht bestätigt', key: 'terms', onClick: () => screens.go('terms', { readOnly: true }) }),
        ),
        group(
          'Konto',
          rowBtn({ iconName: 'log-out', title: 'Abmelden', key: 'logout', onClick: () => signOut() }),
          rowBtn({ iconName: 'trash', title: 'Konto löschen', sub: 'Entfernt dein Konto, deine Freunde und Nachrichten dauerhaft', danger: true, key: 'delete', onClick: deleteAccount }),
        ),
      ];
    },

    appearance() {
      const accents = [
        ['hybrid', 'Hybrid (Blau × Grün)', 'linear-gradient(90deg,#0a6cff,#10a310)'],
        ['blue', 'PlayStation-Blau', 'linear-gradient(90deg,#0a4fd6,#2b8bff)'],
        ['green', 'Xbox-Grün', 'linear-gradient(90deg,#0e7a0e,#2ccf2c)'],
      ];
      return [
        group(
          'Akzentfarbe',
          accents.map(([id, title, grad]) =>
            rowBtn({
              iconEl: h('span.swatch', { style: { background: grad } }),
              title,
              end: prefs.get('accent') === id ? icon('check') : null,
              cls: prefs.get('accent') === id ? 'selected' : '',
              key: `acc-${id}`,
              onClick: () => {
                prefs.set('accent', id);
                unlock('stylist');
                show('appearance', true);
              },
            }),
          ),
        ),
        group(
          'Hintergrund & Anzeige',
          toggleRow({ iconName: 'sparkles', title: 'Schwebende Partikel', sub: 'Bokeh-Lichter auf der Startseite', get: () => prefs.get('particles'), set: (v) => prefs.set('particles', v), key: 'particles' }),
          toggleRow({ iconName: 'clock', title: '24-Stunden-Format', get: () => prefs.get('clock24'), set: (v) => prefs.set('clock24', v), key: 'clock' }),
        ),
      ];
    },

    sound() {
      return [
        group(
          'Lautstärke',
          slider({ iconName: 'volume-2', value: prefs.get('volume'), onChange: (v) => prefs.set('volume', v), key: 'vol' }),
        ),
        group(
          'Klänge',
          toggleRow({ iconName: 'sparkle', title: 'Systemklänge', sub: 'Navigation, Auswahl, Benachrichtigungen', get: () => prefs.get('sounds'), set: (v) => prefs.set('sounds', v), key: 'sounds' }),
          rowBtn({ iconName: 'play', title: 'Testklang abspielen', key: 'test', onClick: () => play('achievement') }),
        ),
      ];
    },

    notifications() {
      return [
        group(
          'Anzeige',
          toggleRow({ iconName: 'bell-ring', title: 'Pop-up-Benachrichtigungen', sub: 'Freundschaftsanfragen, Nachrichten, Downloads', get: () => prefs.get('toasts'), set: (v) => prefs.set('toasts', v), key: 'toasts' }),
          rowBtn({ iconName: 'bell', title: 'Test-Benachrichtigung', key: 'testn', onClick: () => toast({ title: 'Hallo von X-Station!', body: 'So sehen Benachrichtigungen aus.', iconName: 'sparkles', force: true }) }),
        ),
      ];
    },

    access() {
      return [
        group(
          'Darstellung',
          toggleRow({ iconName: 'activity', title: 'Bewegung reduzieren', sub: 'Verkürzt Animationen und blendet Partikel aus', get: () => prefs.get('reduceMotion'), set: (v) => prefs.set('reduceMotion', v), key: 'motion' }),
          toggleRow({ iconName: 'file-text', title: 'Große Schrift', get: () => prefs.get('textSize') === 'large', set: (v) => prefs.set('textSize', v ? 'large' : 'normal'), key: 'large' }),
        ),
      ];
    },

    browser() {
      const proxyAvailable = api.mode === 'server';
      return [
        group(
          'Suchmaschine',
          SEARCH_ENGINES.map((se) =>
            rowBtn({
              iconName: 'search',
              title: se.name,
              sub: se.note,
              end: prefs.get('searchEngine') === se.id ? icon('check') : null,
              cls: prefs.get('searchEngine') === se.id ? 'selected' : '',
              key: `se-${se.id}`,
              onClick: () => {
                prefs.set('searchEngine', se.id);
                show('browser', true);
              },
            }),
          ),
        ),
        group(
          'Datenschutz & Technik',
          proxyAvailable
            ? toggleRow({
                iconName: 'shield-check',
                title: 'Seiten über X-Station laden (empfohlen)',
                sub: 'Nötig, damit die meisten Webseiten in der App angezeigt werden können',
                get: () => prefs.get('browserProxy'),
                set: (v) => prefs.set('browserProxy', v),
                key: 'proxy',
              })
            : rowBtn({ iconName: 'shield', title: 'Proxy nicht verfügbar', sub: 'Im lokalen Modus werden Seiten direkt geladen – viele Seiten blockieren das.' }),
          rowBtn({
            iconName: 'trash',
            title: 'Verlauf löschen',
            key: 'clear',
            onClick: () => {
              save(`xs.browser.history.${store.get('user')?.id}`, []);
              toast({ title: 'Verlauf gelöscht', iconName: 'check', force: true });
            },
          }),
        ),
      ];
    },

    controls() {
      const rows = [
        ['Bewegen', 'Pfeiltasten / WASD', 'Steuerkreuz / L-Stick', 'Steuerkreuz / L-Stick'],
        ['Auswählen', 'Enter / Leertaste', 'A', '✕'],
        ['Zurück', 'Esc / Rücktaste', 'B', '○'],
        ['Control Center', 'C / Pos1 / F1', 'Xbox-Taste', 'PS-Taste'],
        ['Guide', 'G / F2', 'Ansicht-Taste', 'Create-Taste'],
        ['Guide-Tabs', 'Q / E', 'LB / RB', 'L1 / R1'],
        ['Seite scrollen (Browser)', 'Mausrad', 'R-Stick', 'R-Stick'],
      ];
      return [
        h(
          'div.set-group.focus-block.nav',
          { tabindex: '-1', dataset: { key: 'keys' } },
          label('Tastenbelegung'),
          h('div.key-table', h('b', 'Aktion'), h('b', 'Tastatur'), h('b', 'Xbox-Controller'), h('b', 'PS-Controller'), rows.flat().map((c) => h('span', c))),
        ),
        group(
          'Status',
          rowBtn({ iconName: 'gamepad-2', title: 'Controller', sub: input.padType !== 'generic' || navigator.getGamepads?.().some(Boolean) ? `Erkannt: ${input.padType === 'playstation' ? 'PlayStation-Layout' : input.padType === 'xbox' ? 'Xbox-Layout' : 'Standard-Layout'}` : 'Kein Controller verbunden – drücke eine Taste am Controller', key: 'pad' }),
          rowBtn({ iconName: 'keyboard', title: 'Aktuelle Eingabe', sub: { mouse: 'Maus / Touch', keyboard: 'Tastatur', gamepad: 'Controller' }[input.type], key: 'inp' }),
        ),
      ];
    },

    system() {
      const installed = library.installed();
      const games = installed.reduce((s, g) => s + parseFloat(g.size.replace(',', '.')), 0);
      const total = 825;
      const sys = 61.4;
      const apps = 12.8;
      const free = total - games - sys - apps;
      const pct = (v) => `${(v / total) * 100}%`;
      return [
        group(
          'Speicher (simuliert)',
          h(
            'div.focus-block.nav',
            { tabindex: '-1', dataset: { key: 'storage' } },
            h(
              'div.storage-bar',
              h('div', { style: { width: pct(games), background: '#0a6cff' } }),
              h('div', { style: { width: pct(apps), background: '#10a310' } }),
              h('div', { style: { width: pct(sys), background: '#8a93a6' } }),
            ),
            h(
              'div.storage-legend',
              h('span', h('i', { style: { background: '#0a6cff' } }), `Spiele ${games.toFixed(1).replace('.', ',')} GB (${installed.length})`),
              h('span', h('i', { style: { background: '#10a310' } }), `Apps ${String(apps).replace('.', ',')} GB`),
              h('span', h('i', { style: { background: '#8a93a6' } }), `System ${String(sys).replace('.', ',')} GB`),
              h('span', h('i', { style: { background: 'rgba(255,255,255,.15)' } }), `Frei ${free.toFixed(1).replace('.', ',')} GB von ${total} GB`),
            ),
          ),
        ),
        group(
          'Verbindung',
          rowBtn({ iconName: api.mode === 'server' ? 'globe' : 'hard-drive', title: api.mode === 'server' ? 'Online-Modus' : 'Lokaler Modus', sub: api.mode === 'server' ? `Verbunden mit ${location.host}` : 'Kein X-Station-Server erreichbar. Konten und Freunde existieren nur in diesem Browser.', key: 'mode' }),
        ),
        group(
          'Zurücksetzen',
          rowBtn({ iconName: 'rotate-cw', title: 'X-Station neu starten', key: 'restart', onClick: () => restart() }),
          rowBtn({
            iconName: 'refresh-cw',
            title: 'Einstellungen zurücksetzen',
            sub: 'Setzt Design, Ton und Browser-Einstellungen auf diesem Gerät zurück',
            key: 'reset',
            onClick: async () => {
              if (await confirmDialog('Einstellungen zurücksetzen?', 'Alle Geräte-Einstellungen werden auf die Standardwerte gesetzt. Dein Konto bleibt unverändert.', { confirm: 'Zurücksetzen' })) {
                prefs.reset();
                show('system', true);
              }
            },
          }),
          rowBtn({
            iconName: 'trash',
            title: 'Spielbibliothek zurücksetzen',
            sub: 'Stellt die simulierten Downloads wieder her',
            key: 'libreset',
            onClick: () => {
              for (const g of GAMES) library.set(g.id, { installed: !!g.installed, owned: !!g.installed });
              show('system', true);
            },
          }),
        ),
      ];
    },

    info() {
      const versionRow = rowBtn({ iconName: 'cpu', title: 'Systemsoftware', end: '…', key: 'ver' });
      api.backend
        .health()
        .then((hdata) => {
          const end = versionRow.querySelector('.rb-end');
          if (end) end.textContent = `X-Station ${hdata.version || '1.0.0'}`;
        })
        .catch(() => {});
      return [
        h('div.info-hero', logoFull({ size: '3rem' }), h('div', h('div', { style: { fontSize: '1.3rem', fontWeight: 600 } }, 'X-Station'), h('div.ver', 'PlayStation × Xbox – 50/50 verschmolzen. Ein inoffizielles Fan-Projekt.'))),
        group(
          'Systeminformationen',
          versionRow,
          rowBtn({ iconName: 'globe', title: 'Betriebsmodus', end: api.mode === 'server' ? 'Online (Server)' : 'Lokal (ohne Server)', key: 'mode' }),
          rowBtn({ iconName: 'shield-check', title: 'Nutzungsbedingungen', end: `Version ${TERMS_VERSION} · ${TERMS_DATE}`, key: 'terms', onClick: () => screens.go('terms', { readOnly: true }) }),
        ),
        h('div.set-group', label('Rechtlicher Hinweis'), h('div.legal-block.focus-block.nav', { tabindex: '-1', dataset: { key: 'legal' } }, DISCLAIMER.map((p) => h('p', p)))),
        h(
          'div.set-group',
          label('Credits'),
          h(
            'div.credits',
            CREDITS.map((c, i) =>
              h(
                'div.focus-block.nav',
                { tabindex: '-1', dataset: { key: `credits-${i}` } },
                h('h4', c.heading),
                c.lines.map(([k, v]) => h('div.credit-line', h('span', k), h('span', v))),
              ),
            ),
          ),
        ),
        group(
          'Lizenzen',
          rowBtn({
            iconName: 'file-text',
            title: 'Open-Source-Lizenzen',
            key: 'licenses',
            onClick: () =>
              dialog({
                title: 'Open-Source-Lizenzen',
                wide: true,
                text: [
                  'Schriftart „Inter“ – Copyright © 2016 The Inter Project Authors. Lizenziert unter der SIL Open Font License, Version 1.1. Der Lizenztext liegt unter /fonts/OFL-Inter.txt bei.',
                  'Symbole „Lucide“ – Copyright © Lucide Contributors (teilweise abgeleitet von Feather, © Cole Bemis). Lizenziert unter der ISC-Lizenz: Die Nutzung, Vervielfältigung, Änderung und Verbreitung ist mit oder ohne Gebühr gestattet, sofern der Urheberrechtshinweis und dieser Erlaubnishinweis erhalten bleiben. Die Software wird „wie besehen“ ohne jegliche Gewährleistung bereitgestellt.',
                  'Alle übrigen Grafiken, Klänge und der Programmcode von X-Station wurden eigenständig für dieses Projekt erstellt.',
                ],
              }),
          }),
        ),
      ];
    },
  };

  // ---------- Konto-Aktionen ----------
  async function saveMe(patch) {
    try {
      const me = await call.updateMe(patch);
      store.set('user', me);
      accounts.update(me);
      play('select');
      show('account', true);
    } catch (e) {
      toast({ title: 'Nicht gespeichert', body: e.message, force: true });
    }
  }

  async function pickAvatar() {
    const u = store.get('user');
    let chosen = u.avatar;
    const picks = AVATAR_LIST.map((a) => {
      const b = h('button.avatar-pick.nav', { class: a.id === chosen ? 'selected' : '' }, avatarEl(a.id));
      b.addEventListener('click', () => {
        chosen = a.id;
        picks.forEach((p) => p.classList.toggle('selected', p === b));
      });
      return b;
    });
    const res = await dialog({
      title: 'Avatar wählen',
      wide: true,
      content: h('div.dlg-form', h('div.avatar-grid', { dataset: { group: '' } }, picks)),
      actions: [
        { label: 'Abbrechen', value: null },
        { label: 'Übernehmen', value: 'ok', primary: true },
      ],
      initial: () => picks.find((p) => p.classList.contains('selected')),
    });
    if (res === 'ok' && chosen !== u.avatar) saveMe({ avatar: chosen });
  }

  async function changePassword() {
    const cur = h('input.input.nav', { type: 'password', autocomplete: 'current-password' });
    const next = h('input.input.nav', { type: 'password', autocomplete: 'new-password' });
    const next2 = h('input.input.nav', { type: 'password', autocomplete: 'new-password' });
    const res = await dialog({
      title: 'Passwort ändern',
      content: h('div.dlg-form', h('div.field', h('label', 'Aktuelles Passwort'), cur), h('div.field', h('label', 'Neues Passwort (mind. 8 Zeichen)'), next), h('div.field', h('label', 'Neues Passwort wiederholen'), next2)),
      actions: [
        { label: 'Abbrechen', value: null },
        { label: 'Ändern', value: 'ok', primary: true },
      ],
      initial: () => cur,
    });
    if (res !== 'ok') return;
    if (next.value !== next2.value) return toast({ title: 'Passwörter stimmen nicht überein', iconName: 'info', force: true });
    try {
      await call.changePassword(cur.value, next.value);
      toast({ title: 'Passwort geändert', iconName: 'check', force: true });
    } catch (e) {
      toast({ title: 'Passwort nicht geändert', body: e.message, iconName: 'info', force: true });
    }
  }

  async function deleteAccount() {
    const pw = h('input.input.nav', { type: 'password', autocomplete: 'current-password' });
    const res = await dialog({
      title: 'Konto endgültig löschen?',
      text: 'Dein Konto, deine Freundesliste, Nachrichten und Erfolge werden dauerhaft vom Server gelöscht. Das kann nicht rückgängig gemacht werden.',
      iconName: 'trash',
      content: h('div.dlg-form', h('div.field', h('label', 'Zur Bestätigung dein Passwort'), pw)),
      actions: [
        { label: 'Abbrechen', value: null, primary: true },
        { label: 'Konto löschen', value: 'ok', danger: true },
      ],
      initial: () => pw,
    });
    if (res !== 'ok') return;
    try {
      const u = store.get('user');
      await call.deleteAccount(pw.value);
      accounts.remove(u.id);
      toast({ title: 'Konto gelöscht', body: 'Schade, dass du gehst!', iconName: 'check', force: true });
      signOut();
    } catch (e) {
      toast({ title: 'Konto nicht gelöscht', body: e.message, iconName: 'info', force: true });
    }
  }

  const el = h(
    'div.app-screen.settings-screen',
    h('div.stage-bg'),
    h('header.app-header', h('h1', icon('settings'), 'Einstellungen'), clockEl('clock')),
    h('div.settings-body', navEl, panel),
  );

  return {
    el,
    activity: 'In den Einstellungen',
    recent: { title: 'Einstellungen', icon: 'settings' },
    initialFocus: () => navRows.find((r) => r.dataset.section === current),
    onShow() {
      setActivity('In den Einstellungen');
      show(current, true);
      unsubs.push(
        store.on('user', () => current === 'account' && show('account', true)),
        bus.on('input-type', () => current === 'controls' && show('controls', true)),
      );
    },
    onHide() {
      unsubs.splice(0).forEach((u) => u());
    },
    onReopen({ section: s } = {}) {
      if (s) {
        show(s);
        const row = navRows.find((r) => r.dataset.section === s);
        if (row) nav.focus(row, { silent: true });
      }
    },
    onBack() {
      if (panel.contains(nav.current)) {
        const row = navRows.find((r) => r.dataset.section === current);
        nav.focus(row, { sound: true });
        return true;
      }
      screens.back();
      return true;
    },
  };
}
