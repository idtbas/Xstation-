// Control Center (PS5-Stil, unten) und Guide (Xbox-Stil, links).

import { h, icon, clear, wait, append } from '../core/dom.js';
import { nav } from '../core/focus.js';
import { input } from '../core/input.js';
import { play } from '../core/sound.js';
import { screens } from '../core/screens.js';
import { store, bus, prefs } from '../core/store.js';
import { api, call } from '../core/api.js';
import { refreshFriends, refreshConversations, refreshMe, unlock } from '../core/system.js';
import { clockEl, relativeTime, formatDate, formatTime } from '../core/util.js';
import { music, STATIONS } from '../core/music.js';
import { avatarEl, STATUS_LABEL } from '../ui/avatars.js';
import { logoMark } from '../ui/logo.js';
import { rowBtn, toggleRow, slider, label } from '../ui/components.js';
import { confirmDialog, dialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { setHints } from '../ui/hints.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { GAME_BY_ID } from '../data/games.js';
import { artFor } from '../ui/art.js';
import { APPS } from '../data/games.js';

let cc = null;
let guide = null;
const seen = { cc: false, guide: false };

function overlaysRoot() {
  return document.getElementById('overlays');
}

function markSeen(kind) {
  seen[kind] = true;
  if (seen.cc && seen.guide) unlock('explorer');
}

function restoreHints() {
  const cur = screens.current();
  screens.updateHints(cur?.instance.hints);
}

export function closeOverlays() {
  if (cc) cc.close(true);
  if (guide) guide.close(true);
}

export function toggleControlCenter() {
  if (cc) return cc.close();
  if (guide) guide.close(true);
  openControlCenter();
}

export function toggleGuide() {
  if (guide) return guide.close();
  openGuide({});
}

export function openGuide(opts = {}) {
  if (cc) cc.close(true);
  if (guide) return guide.show(opts);
  guide = createGuide();
  guide.show(opts);
}

// ======================================================================
// Control Center
// ======================================================================
function openControlCenter() {
  play('open');
  markSeen('cc');
  const unsubs = [];
  let popLayer = null;
  let popEl = null;
  let popFrom = null;

  const root = h('div.cc-root');
  const dim = h('div.cc-dim');
  const cards = h('div.cc-cards', { dataset: { group: '', trap: 'x', remember: '' } });
  const popSlot = h('div');
  const notifBadge = h('span.badge', { style: { display: 'none' } });

  const icons = [
    { id: 'home', icon: 'house', tip: 'Startseite', action: () => goHome() },
    { id: 'notifications', icon: 'bell', tip: 'Benachrichtigungen', pop: popNotifications, badge: notifBadge },
    { id: 'friends', icon: 'users', tip: 'Freunde', action: () => openGuide({ tab: 'friends' }) },
    { id: 'music', icon: 'disc-3', tip: 'Musik', pop: popMusic },
    { id: 'sound', icon: 'volume-2', tip: 'Ton', pop: popSound },
    { id: 'access', icon: 'accessibility', tip: 'Barrierefreiheit', pop: popAccess },
    { id: 'network', icon: 'wifi', tip: 'Netzwerk', pop: popNetwork },
    { id: 'settings', icon: 'settings', tip: 'Einstellungen', action: () => openSettings() },
    { id: 'power', icon: 'power', tip: 'Ein/Aus', pop: popPower },
  ];
  const iconEls = icons.map((it) => {
    const el = h('button.cc-icon.nav', { 'aria-label': it.tip, dataset: { key: it.id } }, icon(it.icon), it.badge || null, h('span.tip', it.tip));
    el.addEventListener('click', () => (it.pop ? openPop(it.pop, el) : it.action()));
    return el;
  });
  if (store.get('music').playing) iconEls[3].classList.add('active');

  const bar = h(
    'div.cc-bar',
    h('div.cc-icons', { dataset: { group: '', trap: 'x', remember: '' } }, iconEls.slice(0, 1), h('span.cc-sep'), iconEls.slice(1)),
    h(
      'div.cc-right',
      h('span.net', icon(api.mode === 'local' ? 'hard-drive' : 'wifi'), api.mode === 'local' ? 'Lokal' : store.get('online') === false ? 'Getrennt' : 'Verbunden'),
      clockEl('cc-clock'),
    ),
  );
  root.append(dim, h('div.cc-panel', cards, popSlot, bar));
  dim.addEventListener('click', () => close());

  function goHome() {
    close(true);
    if (!screens.is('home')) screens.go('home', {}, { reset: true });
  }
  function openSettings() {
    close(true);
    if (!screens.is('settings')) screens.go('settings');
  }

  // ---------- Karten ----------
  function ccCard({ kicker, kIcon, title, sub, art, extra, onClick, delay = 0 }) {
    const el = h(
      'button.cc-card.nav',
      { style: { animationDelay: `${delay}ms` } },
      art ? h('div.cc-art', { style: { backgroundImage: `url("${art}")` } }) : null,
      art ? h('div.cc-shade') : null,
      h('div.cc-k', icon(kIcon), kicker),
      h('div', h('div.cc-t', title), sub ? h('div.cc-s', sub) : null, extra || null),
    );
    el.addEventListener('click', onClick);
    return el;
  }

  function renderCards() {
    const focusedIdx = [...cards.children].indexOf(nav.current);
    clear(cards);
    const list = [];
    const cur = screens.current();
    const recent = store.get('recent').slice(0, 3);
    recent.forEach((r, i) => {
      const app = APPS[r.id];
      const game = GAME_BY_ID[r.id];
      list.push(
        ccCard({
          kicker: i === 0 && cur && (cur.name === r.id || (r.id === 'home' && cur.name === 'home')) ? 'Aktuell' : 'Zuletzt verwendet',
          kIcon: r.icon || 'app-window',
          title: r.title,
          sub: r.sub || null,
          art: app ? artFor(app, 'wide') : game ? artFor(game, 'wide') : null,
          onClick: () => {
            close(true);
            if (r.id === 'home') goHome();
            else if (screens.is(r.id)) return;
            else screens.go(r.id, r.params || {});
          },
          delay: list.length * 40,
        }),
      );
    });
    for (const d of store.get('downloads')) {
      list.push(
        ccCard({
          kicker: 'Download',
          kIcon: 'download',
          title: d.title,
          sub: `${Math.round(d.progress * 100)} % von ${String(d.total).replace('.', ',')} GB`,
          extra: h('div.bar', { style: { marginTop: '0.6rem' } }, h('div', { style: { width: `${d.progress * 100}%` } })),
          onClick: () => {},
          delay: list.length * 40,
        }),
      );
    }
    const m = store.get('music');
    list.push(
      ccCard({
        kicker: 'Musik',
        kIcon: 'disc-3',
        title: m.playing ? m.title : 'Nichts wird abgespielt',
        sub: m.playing ? `${m.mood} · Zum Pausieren auswählen` : 'Zum Abspielen auswählen',
        onClick: () => music.toggle(),
        delay: list.length * 40,
      }),
    );
    const friends = store.get('friends').friends;
    const online = friends.filter((f) => f.online);
    list.push(
      ccCard({
        kicker: 'Freunde',
        kIcon: 'users',
        title: online.length ? `${online.length} ${online.length === 1 ? 'Freund' : 'Freunde'} online` : 'Niemand online',
        sub: friends.length ? null : 'Füge Freunde im Guide hinzu',
        extra: online.length ? h('div.avatars', { style: { marginTop: '0.5rem' } }, online.slice(0, 6).map((f) => avatarEl(f.avatar))) : null,
        onClick: () => openGuide({ tab: 'friends' }),
        delay: list.length * 40,
      }),
    );
    cards.append(...list);
    if (focusedIdx >= 0 && cards.children[focusedIdx]) nav.focus(cards.children[focusedIdx], { silent: true });
    const unread = store.get('notifications').filter((n) => !n.read).length;
    notifBadge.textContent = unread;
    notifBadge.style.display = unread ? '' : 'none';
    iconEls[3].classList.toggle('active', store.get('music').playing);
  }

  // ---------- Popover ----------
  function openPop(builder, fromEl) {
    closePop(true);
    popFrom = fromEl;
    popEl = h('div.cc-pop', builder());
    popSlot.append(popEl);
    popLayer = nav.pushLayer(popEl, { name: 'cc-pop', onBack: () => (closePop(), true) });
    play('open');
  }
  function closePop(silent) {
    if (!popEl) return;
    nav.popLayer(popLayer);
    popEl.remove();
    popEl = null;
    popLayer = null;
    if (!silent && popFrom) nav.focus(popFrom, { silent: true });
  }

  function popNotifications() {
    const list = store.get('notifications').slice(0, 5);
    return [
      h('h3', icon('bell'), 'Benachrichtigungen'),
      list.length ? list.map((n) => notificationRow(n, () => (close(true), openGuide({ tab: n.type === 'friend-request' ? 'friends' : 'notifications' })))) : h('div.g-empty', 'Keine neuen Benachrichtigungen.'),
      rowBtn({ iconName: 'arrow-right', title: 'Alle anzeigen', onClick: () => openGuide({ tab: 'notifications' }) }),
    ];
  }

  function popMusic() {
    const m = store.get('music');
    return [
      h('h3', icon('disc-3'), 'Musik'),
      STATIONS.map((st) =>
        rowBtn({
          iconName: m.station === st.id ? 'pause' : 'play',
          title: st.title,
          sub: st.mood,
          end: m.station === st.id ? 'Läuft' : null,
          onClick: () => {
            music.toggle(st.id);
            unlock('dj');
            openPop(popMusic, iconEls[3]);
          },
        }),
      ),
    ];
  }

  function popSound() {
    return [
      h('h3', icon('volume-2'), 'Ton'),
      slider({ iconName: 'volume-2', value: prefs.get('volume'), onChange: (v) => prefs.set('volume', v), key: 'vol' }),
      toggleRow({ iconName: 'sparkle', title: 'Systemklänge', get: () => prefs.get('sounds'), set: (v) => prefs.set('sounds', v) }),
      toggleRow({ iconName: 'bell-ring', title: 'Benachrichtigungen anzeigen', get: () => prefs.get('toasts'), set: (v) => prefs.set('toasts', v) }),
    ];
  }

  function popAccess() {
    return [
      h('h3', icon('accessibility'), 'Barrierefreiheit'),
      toggleRow({ iconName: 'activity', title: 'Bewegung reduzieren', get: () => prefs.get('reduceMotion'), set: (v) => prefs.set('reduceMotion', v) }),
      toggleRow({ iconName: 'file-text', title: 'Große Schrift', get: () => prefs.get('textSize') === 'large', set: (v) => prefs.set('textSize', v ? 'large' : 'normal') }),
      toggleRow({ iconName: 'sparkles', title: 'Partikel im Hintergrund', get: () => prefs.get('particles'), set: (v) => prefs.set('particles', v) }),
    ];
  }

  function popNetwork() {
    const local = api.mode === 'local';
    return [
      h('h3', icon('wifi'), 'Netzwerk'),
      rowBtn({ iconName: local ? 'hard-drive' : 'globe', title: local ? 'Lokaler Modus' : 'X-Station-Server', sub: local ? 'Kein Server erreichbar – Konten nur in diesem Browser' : location.host }),
      rowBtn({ iconName: 'activity', title: 'Live-Verbindung', sub: store.get('online') === false ? 'Wird wiederhergestellt …' : 'Aktiv' }),
      rowBtn({ iconName: 'shield-check', title: 'Browser-Proxy', sub: local ? 'Nicht verfügbar (direkter Modus)' : 'Aktiv, Seiten laufen isoliert' }),
    ];
  }

  function popPower() {
    return [
      h('h3', icon('power'), 'Ein/Aus-Optionen'),
      rowBtn({ iconName: 'moon', title: 'Ruhemodus aktivieren', onClick: () => import('./flow.js').then((f) => f.restMode()) }),
      rowBtn({ iconName: 'log-out', title: 'Abmelden', onClick: () => import('./flow.js').then((f) => f.signOut()) }),
      rowBtn({ iconName: 'rotate-cw', title: 'X-Station neu starten', onClick: () => import('./flow.js').then((f) => f.restart()) }),
      rowBtn({ iconName: 'power', title: 'X-Station ausschalten', danger: true, onClick: () => import('./flow.js').then((f) => f.powerOff()) }),
    ];
  }

  // ---------- Öffnen/Schließen ----------
  let closing = false;
  async function close(fast = false) {
    if (closing) return;
    closing = true;
    closePop(true);
    unsubs.forEach((u) => u());
    nav.popLayer(layer);
    if (!fast) play('close');
    root.classList.add('out');
    cc = null;
    restoreHints();
    await wait(fast ? 0 : 260);
    root.remove();
  }

  overlaysRoot().append(root);
  renderCards();
  const layer = nav.pushLayer(root, { name: 'cc', onBack: () => (close(), true), initial: () => cards.firstElementChild || iconEls[0] });
  unsubs.push(
    store.on('downloads', renderCards),
    store.on('music', renderCards),
    store.on('friends', renderCards),
    store.on('notifications', renderCards),
  );
  setHints([
    ['accept', 'Auswählen'],
    ['back', 'Schließen'],
    ['home', 'Schließen'],
  ]);
  cc = { close };
}

function notificationRow(n, onClick) {
  const d = n.data || {};
  const text =
    n.type === 'friend-request'
      ? `${d.displayName} möchte mit dir befreundet sein`
      : n.type === 'friend-accepted'
        ? `${d.displayName} hat deine Freundschaftsanfrage angenommen`
        : d.text || 'Benachrichtigung';
  return rowBtn({
    iconEl: d.avatar ? avatarEl(d.avatar, { size: '2.6rem' }) : icon('bell'),
    title: text,
    sub: relativeTime(n.createdAt),
    end: n.read ? null : h('span.dot-inline', { dataset: { status: 'online' } }),
    onClick,
    key: `n-${n.id}`,
  });
}

// ======================================================================
// Guide
// ======================================================================
function createGuide() {
  play('open');
  markSeen('guide');
  const unsubs = [];
  let tab = 'home';
  let stack = []; // Unteransichten
  let layer = null;
  let chatWith = null;

  const TABS = [
    { id: 'home', label: 'Start', iconEl: () => logoMark({ size: '1.7rem' }) },
    { id: 'friends', label: 'Freunde', icon: 'users' },
    { id: 'chats', label: 'Chats', icon: 'message-circle' },
    { id: 'notifications', label: 'Benachrichtigungen', icon: 'bell' },
    { id: 'achievements', label: 'Erfolge', icon: 'trophy' },
    { id: 'profile', label: 'Profil & System', icon: 'user' },
  ];
  const badges = {};
  const tabEls = TABS.map((t) => {
    badges[t.id] = h('span.badge', { style: { display: 'none' } });
    const el = h('button.g-tab.nav', { 'aria-label': t.label, title: t.label, dataset: { tab: t.id } }, t.iconEl ? t.iconEl() : icon(t.icon), badges[t.id]);
    el.addEventListener('navfocus', () => {
      if (tab !== t.id) setTab(t.id, false);
    });
    el.addEventListener('click', () => {
      if (tab !== t.id) setTab(t.id, false);
      focusBody();
    });
    return el;
  });

  const userSlot = h('div.g-user');
  const head = h('div.g-head', userSlot, clockEl('g-clock'));
  const tabsEl = h('nav.g-tabs', { dataset: { group: '', trap: 'x' } }, tabEls);
  const titleEl = h('div.g-title');
  const bodyWrap = h('div', { style: { flex: '1', minHeight: '0', display: 'flex', flexDirection: 'column' } });
  const panel = h('aside.guide', head, tabsEl, titleEl, bodyWrap);
  const dim = h('div.guide-dim');
  const root = h('div.guide-root', dim, panel);
  dim.addEventListener('click', () => close());

  function renderHead() {
    const u = store.get('user');
    if (!u) return;
    clear(userSlot).append(
      avatarEl(u.avatar, { status: u.status === 'invisible' ? 'offline' : u.status }),
      h('div', h('b', u.displayName), h('small', `${u.score} XP · ${STATUS_LABEL[u.status] || 'Online'}`)),
    );
    const f = store.get('friends');
    const unreadChats = store.get('conversations').reduce((s, c) => s + c.unread, 0);
    const unreadNotes = store.get('notifications').filter((n) => !n.read).length;
    setBadge('friends', f.incoming.length);
    setBadge('chats', unreadChats);
    setBadge('notifications', unreadNotes);
  }
  function setBadge(id, n) {
    badges[id].textContent = n;
    badges[id].style.display = n ? '' : 'none';
  }

  function setTab(id, focus = true) {
    tab = id;
    stack = [];
    chatWith = null;
    tabEls.forEach((el) => el.classList.toggle('active', el.dataset.tab === id));
    render();
    if (focus) focusBody();
    if (id === 'notifications') markNotificationsRead();
  }

  function focusBody() {
    requestAnimationFrame(() => {
      const first = nav.focusablesIn(root).find((el) => bodyWrap.contains(el));
      if (first) nav.focus(first, { silent: true });
    });
  }

  function push(view) {
    stack.push(view);
    render();
    focusBody();
    play('select');
  }

  function pop() {
    if (!stack.length) return false;
    const left = stack.pop();
    if (left.id === 'chat') chatWith = null;
    render();
    focusBody();
    return true;
  }

  function currentView() {
    return stack[stack.length - 1] || VIEWS[tab]();
  }

  function render() {
    const view = currentView();
    const keyed = nav.current?.dataset?.key && bodyWrap.contains(nav.current) ? nav.current.dataset.key : null;
    append(clear(titleEl), [h('span', view.title), view.titleEnd ? h('small', view.titleEnd) : null]);
    const body = h('div.g-body', { class: view.noScroll ? '' : 'scroll-y' }, view.render());
    if (view.noScroll) body.style.display = 'flex';
    clear(bodyWrap).append(body);
    if (keyed) {
      const again = body.querySelector(`[data-key="${CSS.escape(keyed)}"]`);
      if (again) nav.focus(again, { silent: true, scroll: false });
      else focusBody();
    }
    renderHead();
  }

  function liveRefresh() {
    const view = currentView();
    if (view.live === false) {
      renderHead();
      return;
    }
    render();
  }

  // ---------- Ansichten ----------
  const VIEWS = {
    home: () => ({
      title: 'X-Station',
      render: () => [
        rowBtn({ iconName: 'house', title: 'Startseite', key: 'home', onClick: () => go('home') }),
        rowBtn({ iconName: 'layout-grid', title: 'Meine Spiele & Apps', key: 'lib', onClick: () => go('library') }),
        rowBtn({ iconName: 'shopping-bag', title: 'Store', key: 'store', onClick: () => go('store') }),
        rowBtn({ iconName: 'globe', title: 'Browser', key: 'browser', onClick: () => go('browser') }),
        rowBtn({ iconName: 'disc-3', title: 'Musik', key: 'music', onClick: () => go('music') }),
        rowBtn({ iconName: 'search', title: 'Suche', key: 'search', onClick: () => go('search') }),
        h(
          'div.g-section',
          label('Zuletzt verwendet'),
          store
            .get('recent')
            .slice(0, 4)
            .map((r) => rowBtn({ iconName: r.icon || 'app-window', title: r.title, sub: r.sub, key: `r-${r.id}`, onClick: () => go(r.id, r.params) })),
        ),
      ],
    }),

    friends: () => {
      const { friends, incoming, outgoing } = store.get('friends');
      const online = friends.filter((f) => f.online);
      const offline = friends.filter((f) => !f.online);
      return {
        title: 'Freunde',
        titleEnd: `${online.length} online`,
        render: () => [
          rowBtn({ iconName: 'user-plus', title: 'Freund hinzufügen', sub: 'Suche andere registrierte Nutzer', key: 'add', onClick: () => push(addView()) }),
          incoming.length
            ? h(
                'div.g-section',
                label(`Freundschaftsanfragen (${incoming.length})`),
                incoming.map((u) =>
                  rowBtn({
                    iconEl: avatarEl(u.avatar, { size: '2.6rem' }),
                    title: u.displayName,
                    sub: `@${u.username} · ${relativeTime(u.requestedAt)}`,
                    end: h('span.pill-tag.green', 'Neu'),
                    key: `in-${u.id}`,
                    onClick: () => push(requestView(u)),
                  }),
                ),
              )
            : null,
          h(
            'div.g-section',
            label(`Online (${online.length})`),
            online.length ? online.map(friendRow) : h('div.g-empty', friends.length ? 'Gerade ist niemand online.' : 'Du hast noch keine Freunde. Füge andere Nutzer über ihren Benutzernamen hinzu!'),
          ),
          offline.length ? h('div.g-section', label(`Offline (${offline.length})`), offline.map(friendRow)) : null,
          outgoing.length
            ? h(
                'div.g-section',
                label(`Gesendete Anfragen (${outgoing.length})`),
                outgoing.map((u) =>
                  rowBtn({
                    iconEl: avatarEl(u.avatar, { size: '2.6rem' }),
                    title: u.displayName,
                    sub: `@${u.username} · Anfrage ausstehend`,
                    end: icon('x'),
                    key: `out-${u.id}`,
                    onClick: async () => {
                      if (await confirmDialog('Anfrage zurückziehen?', `Die Freundschaftsanfrage an ${u.displayName} wird zurückgezogen.`, { confirm: 'Zurückziehen' })) {
                        await call.cancelRequest(u.id).catch((e) => toast({ title: 'Fehler', body: e.message, force: true }));
                        refreshFriends();
                      }
                    },
                  }),
                ),
              )
            : null,
        ],
      };
    },

    chats: () => {
      const { friends } = store.get('friends');
      const convs = store.get('conversations');
      const byId = Object.fromEntries(convs.map((c) => [c.userId, c]));
      const sorted = [...friends].sort((a, b) => (byId[b.id]?.last?.at || 0) - (byId[a.id]?.last?.at || 0));
      const me = store.get('user');
      return {
        title: 'Chats',
        render: () =>
          sorted.length
            ? sorted.map((f) => {
                const c = byId[f.id];
                return rowBtn({
                  iconEl: avatarEl(f.avatar, { size: '2.6rem', status: f.online ? f.status : 'offline' }),
                  title: f.displayName,
                  sub: c?.last ? `${c.last.from === me.id ? 'Du: ' : ''}${c.last.text}` : 'Noch keine Nachrichten',
                  end: c?.unread ? h('span.badge', String(c.unread)) : c?.last ? relativeTime(c.last.at) : null,
                  key: `c-${f.id}`,
                  onClick: () => push(chatView(f)),
                });
              })
            : h('div.g-empty', 'Füge zuerst Freunde hinzu, um mit ihnen zu chatten.'),
      };
    },

    notifications: () => {
      const list = store.get('notifications');
      return {
        title: 'Benachrichtigungen',
        render: () => [
          list.length
            ? list.map((n) =>
                notificationRow(n, () => {
                  if (n.type === 'friend-request' || n.type === 'friend-accepted') setTab('friends');
                }),
              )
            : h('div.g-empty', 'Keine Benachrichtigungen.'),
          list.length
            ? h(
                'div.g-actions',
                h(
                  'button.btn.btn-sm.nav',
                  {
                    onclick: async () => {
                      await call.clearNotifications().catch(() => {});
                      store.set('notifications', []);
                    },
                  },
                  icon('trash'),
                  'Alle löschen',
                ),
              )
            : null,
        ],
      };
    },

    achievements: () => {
      const u = store.get('user');
      const got = u?.achievements || {};
      const count = Object.keys(got).length;
      return {
        title: 'Erfolge',
        titleEnd: `${u?.score ?? 0} XP · ${count}/${ACHIEVEMENTS.length}`,
        render: () =>
          ACHIEVEMENTS.map((a) =>
            rowBtn({
              iconName: got[a.id] ? a.icon : 'lock',
              title: a.title,
              sub: got[a.id] ? `Freigeschaltet am ${formatDate(got[a.id])}` : a.desc,
              end: `${a.points} XP`,
              key: `a-${a.id}`,
              cls: got[a.id] ? 'selected' : '',
              onClick: () => go('achievements'),
            }),
          ),
      };
    },

    profile: () => {
      const u = store.get('user');
      const statuses = ['online', 'busy', 'away', 'invisible'];
      return {
        title: 'Profil & System',
        render: () => [
          h(
            'div.g-profile',
            avatarEl(u.avatar, { status: u.status === 'invisible' ? 'offline' : u.status }),
            h('h3', u.displayName),
            h('div.sub', `@${u.username}`),
            u.bio ? h('div.bio', u.bio) : null,
            h('div.g-stats', h('span.pill-tag.blue', `${u.score} XP`), h('span.pill-tag.green', `${store.get('friends').friends.length} Freunde`)),
          ),
          h(
            'div.g-section',
            label('Online-Status'),
            statuses.map((s) =>
              rowBtn({
                iconEl: h('span.dot-inline', { dataset: { status: s === 'invisible' ? 'offline' : s }, style: { margin: '0 0.4rem' } }),
                title: STATUS_LABEL[s],
                end: u.status === s ? icon('check') : null,
                cls: u.status === s ? 'selected' : '',
                key: `st-${s}`,
                onClick: async () => {
                  try {
                    const me = await call.updateMe({ status: s });
                    store.set('user', me);
                  } catch (e) {
                    toast({ title: 'Status nicht geändert', body: e.message, force: true });
                  }
                },
              }),
            ),
          ),
          h(
            'div.g-section',
            label('System'),
            rowBtn({ iconName: 'pencil', title: 'Profil bearbeiten', key: 'edit', onClick: () => go('settings', { section: 'account' }) }),
            rowBtn({ iconName: 'settings', title: 'Einstellungen', key: 'settings', onClick: () => go('settings') }),
            rowBtn({ iconName: 'moon', title: 'Ruhemodus', key: 'rest', onClick: () => import('./flow.js').then((f) => f.restMode()) }),
            rowBtn({ iconName: 'log-out', title: 'Abmelden', key: 'logout', onClick: () => import('./flow.js').then((f) => f.signOut()) }),
            rowBtn({ iconName: 'power', title: 'Ausschalten', key: 'off', danger: true, onClick: () => import('./flow.js').then((f) => f.powerOff()) }),
          ),
        ],
      };
    },
  };

  function friendRow(f) {
    return rowBtn({
      iconEl: avatarEl(f.avatar, { size: '2.6rem', status: f.online ? f.status : 'offline' }),
      title: f.displayName,
      sub: f.online ? `${STATUS_LABEL[f.status] || 'Online'}${f.activity ? ' · ' + f.activity : ''}` : f.lastOnline ? `Zuletzt online ${relativeTime(f.lastOnline)}` : 'Offline',
      end: `${f.score} XP`,
      key: `f-${f.id}`,
      onClick: () => push(profileView(f.id)),
    });
  }

  function addView() {
    const inputEl = h('input.input.nav', { placeholder: 'Benutzername oder Anzeigename', spellcheck: 'false', autocomplete: 'off', maxlength: '24', dataset: { key: 'search' } });
    const results = h('div');
    let timer = null;
    async function search() {
      const q = inputEl.value.trim();
      if (!q) {
        clear(results).append(h('div.g-empty', 'Gib mindestens einen Buchstaben ein. Tipp: Teile deinen Benutzernamen mit Freunden!'));
        return;
      }
      try {
        const { users } = await call.searchUsers(q);
        append(clear(results), [
          users.length
            ? users.map((u) => {
                const rel = {
                  none: ['Anfrage senden', 'user-plus'],
                  outgoing: ['Angefragt', 'clock'],
                  incoming: ['Annehmen', 'user-check'],
                  friend: ['Befreundet', 'check'],
                }[u.relation] || ['', 'user'];
                return rowBtn({
                  iconEl: avatarEl(u.avatar, { size: '2.6rem' }),
                  title: u.displayName,
                  sub: `@${u.username} · ${u.score} XP`,
                  end: h('span', { style: { display: 'flex', alignItems: 'center', gap: '0.4rem' } }, icon(rel[1]), rel[0]),
                  key: `u-${u.id}`,
                  onClick: async () => {
                    if (u.relation === 'none') {
                      try {
                        const res = await call.requestFriend({ userId: u.id });
                        play('select');
                        toast({ title: res.status === 'friends' ? 'Ihr seid jetzt Freunde!' : 'Anfrage gesendet', body: u.displayName, avatar: u.avatar, force: true, sound: null });
                        refreshFriends();
                        search();
                      } catch (e) {
                        toast({ title: 'Anfrage nicht möglich', body: e.message, force: true });
                      }
                    } else if (u.relation === 'incoming') {
                      await call.acceptFriend(u.id).catch(() => {});
                      refreshFriends();
                      search();
                    } else if (u.relation === 'friend') {
                      push(profileView(u.id));
                    }
                  },
                });
              })
            : h('div.g-empty', `Keine Nutzer für „${q}“ gefunden.`),
        ]);
      } catch (e) {
        clear(results).append(h('div.g-empty', e.message));
      }
    }
    inputEl.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(search, 250);
    });
    inputEl.addEventListener('enter', (ev) => {
      ev.preventDefault();
      search();
    });
    search();
    return {
      id: 'add',
      title: 'Freund hinzufügen',
      live: false,
      render: () => [h('div.g-search', inputEl), results],
    };
  }

  function requestView(u) {
    return {
      id: 'request',
      title: 'Freundschaftsanfrage',
      live: false,
      render: () => [
        h('div.g-profile', avatarEl(u.avatar), h('h3', u.displayName), h('div.sub', `@${u.username}`), u.bio ? h('div.bio', u.bio) : null, h('div.g-stats', h('span.pill-tag.blue', `${u.score} XP`))),
        rowBtn({
          iconName: 'user-check',
          title: 'Annehmen',
          key: 'accept',
          onClick: async () => {
            try {
              await call.acceptFriend(u.id);
              toast({ title: 'Neuer Freund', body: `Du und ${u.displayName} seid jetzt Freunde.`, avatar: u.avatar, force: true });
              await refreshFriends();
              pop();
            } catch (e) {
              toast({ title: 'Fehler', body: e.message, force: true });
            }
          },
        }),
        rowBtn({
          iconName: 'user-x',
          title: 'Ablehnen',
          key: 'decline',
          danger: true,
          onClick: async () => {
            await call.declineFriend(u.id).catch(() => {});
            await refreshFriends();
            pop();
          },
        }),
      ],
    };
  }

  function profileView(userId) {
    let data = store.get('friends').friends.find((f) => f.id === userId) || null;
    const view = {
      id: 'profile',
      title: 'Profil',
      live: false,
      render: () => {
        if (!data) return h('div.g-empty', 'Wird geladen …');
        const isFriend = data.relation ? data.relation === 'friend' : true;
        return [
          h(
            'div.g-profile',
            avatarEl(data.avatar, { status: data.online ? data.status : 'offline' }),
            h('h3', data.displayName),
            h('div.sub', `@${data.username}`),
            isFriend
              ? h(
                  'div.status-line',
                  h('span.dot-inline', { dataset: { status: data.online ? data.status : 'offline' } }),
                  data.online ? `${STATUS_LABEL[data.status] || 'Online'}${data.activity ? ' · ' + data.activity : ''}` : data.lastOnline ? `Zuletzt online ${relativeTime(data.lastOnline)}` : 'Offline',
                )
              : null,
            data.bio ? h('div.bio', data.bio) : null,
            h(
              'div.g-stats',
              h('span.pill-tag.blue', `${data.score} XP`),
              h('span.pill-tag', `${data.achievementCount ?? 0} Erfolge`),
              data.friendsSince ? h('span.pill-tag.green', `Freunde seit ${formatDate(data.friendsSince)}`) : null,
            ),
          ),
          isFriend ? rowBtn({ iconName: 'message-circle', title: 'Nachricht senden', key: 'msg', onClick: () => push(chatView(data)) }) : null,
          isFriend
            ? rowBtn({
                iconName: 'user-minus',
                title: 'Freund entfernen',
                key: 'remove',
                danger: true,
                onClick: async () => {
                  if (await confirmDialog('Freund entfernen?', `${data.displayName} wird aus deiner Freundesliste entfernt.`, { confirm: 'Entfernen', danger: true })) {
                    await call.removeFriend(data.id).catch(() => {});
                    await refreshFriends();
                    pop();
                  }
                },
              })
            : null,
        ];
      },
    };
    call
      .getUser(userId)
      .then((u) => {
        data = { ...data, ...u };
        if (currentView() === view) render();
      })
      .catch(() => {});
    return view;
  }

  function chatView(friend) {
    const me = store.get('user');
    const log = h('div.chat-log.scroll-y');
    const inputEl = h('input.input.nav', { placeholder: `Nachricht an ${friend.displayName}`, maxlength: '500', autocomplete: 'off', dataset: { key: 'chat-input' } });
    const send = h('button.btn.btn-icon.btn-primary.nav', { 'aria-label': 'Senden', dataset: { key: 'chat-send' } }, icon('send'));
    chatWith = friend.id;

    function addMsg(m) {
      log.append(h('div.msg', { class: m.from === me.id ? 'mine' : '' }, m.text, h('time', formatTime(new Date(m.at)))));
      log.scrollTop = log.scrollHeight;
    }
    async function load() {
      try {
        const { messages } = await call.messages(friend.id);
        clear(log);
        if (!messages.length) log.append(h('div.g-empty', `Schreib ${friend.displayName} die erste Nachricht!`));
        messages.forEach(addMsg);
        call.readMessages(friend.id).then(refreshConversations).catch(() => {});
      } catch (e) {
        clear(log).append(h('div.g-empty', e.message));
      }
    }
    async function doSend() {
      const text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = '';
      try {
        await call.sendMessage(friend.id, text);
        play('select');
      } catch (e) {
        toast({ title: 'Nachricht nicht gesendet', body: e.message, force: true });
        inputEl.value = text;
      }
    }
    send.addEventListener('click', doSend);
    inputEl.addEventListener('enter', (ev) => {
      ev.preventDefault();
      doSend();
    });
    const off = bus.on('message', (m) => {
      if (chatWith !== friend.id) return;
      if ((m.from === friend.id && m.to === me.id) || (m.from === me.id && m.to === friend.id)) {
        log.querySelector('.g-empty')?.remove();
        addMsg(m);
        if (m.from === friend.id) call.readMessages(friend.id).then(refreshConversations).catch(() => {});
      }
    });
    unsubs.push(off);
    load();
    return {
      id: 'chat',
      title: friend.displayName,
      titleEnd: friend.online ? STATUS_LABEL[friend.status] : 'Offline',
      live: false,
      noScroll: true,
      render: () => h('div.chat', log, h('div.chat-input', { dataset: { group: '' } }, inputEl, send)),
    };
  }

  async function markNotificationsRead() {
    if (!store.get('notifications').some((n) => !n.read)) return;
    await call.readNotifications().catch(() => {});
    setTimeout(() => store.update('notifications', (list) => list.map((n) => ({ ...n, read: true }))), 1500);
  }

  function go(id, params = {}) {
    close(true);
    if (id === 'home') {
      if (!screens.is('home')) screens.go('home', {}, { reset: true });
      return;
    }
    if (screens.is(id)) return screens.current().instance.onReopen?.(params);
    screens.go(id, params);
  }

  // ---------- Öffnen/Schließen ----------
  let closing = false;
  async function close(fast = false) {
    if (closing) return;
    closing = true;
    unsubs.forEach((u) => u());
    releaseInput();
    bus.chatOpenWith = null;
    nav.popLayer(layer);
    if (!fast) play('close');
    root.classList.add('out');
    guide = null;
    restoreHints();
    await wait(fast ? 0 : 260);
    root.remove();
  }

  function show(opts = {}) {
    if (opts.tab) setTab(opts.tab, !opts.userId && !opts.add);
    if (opts.userId) push(profileView(opts.userId));
    if (opts.add) push(addView());
  }

  overlaysRoot().append(root);
  setTab('home', false);
  layer = nav.pushLayer(root, {
    name: 'guide',
    onBack: () => {
      if (pop()) return true;
      close();
      return true;
    },
    initial: () => nav.focusablesIn(root).find((el) => bodyWrap.contains(el)) || tabEls[0],
  });
  bus.chatOpenWith = (id) => chatWith === id;
  const releaseInput = input.intercept((action) => {
    if (action === 'lb' || action === 'rb') {
      const idx = TABS.findIndex((t) => t.id === tab);
      const next = TABS[(idx + (action === 'rb' ? 1 : TABS.length - 1)) % TABS.length];
      setTab(next.id);
      play('move');
      return true;
    }
    return false;
  });
  unsubs.push(
    store.on('friends', liveRefresh),
    store.on('notifications', liveRefresh),
    store.on('conversations', liveRefresh),
    store.on('user', liveRefresh),
  );
  refreshFriends().catch(() => {});
  refreshConversations().catch(() => {});
  refreshMe().catch(() => {});
  setHints([
    ['accept', 'Auswählen'],
    ['back', 'Zurück'],
    ['lb', 'Tab'],
    ['rb', 'Tab'],
  ]);

  return { close, show };
}
