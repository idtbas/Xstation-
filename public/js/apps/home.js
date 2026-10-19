// Startseite: PS5-Kachelreihe mit Hintergrundbild + Hub-Karten, darunter Xbox-Kachelblöcke.

import { h, icon, clear } from '../core/dom.js';
import { nav } from '../core/focus.js';
import { screens } from '../core/screens.js';
import { store, bus, pushRecent } from '../core/store.js';
import { library, startDownload, setActivity } from '../core/system.js';
import { clockEl } from '../core/util.js';
import { music, STATIONS } from '../core/music.js';
import { Ambient } from '../ui/particles.js';
import { artFor, gameArt, appArt } from '../ui/art.js';
import { avatarEl, STATUS_LABEL } from '../ui/avatars.js';
import { dialog } from '../ui/dialog.js';
import { GAMES, APPS } from '../data/games.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { openGuide, toggleControlCenter } from './overlays.js';
import { launchGame } from './launch.js';
import { openApp } from './open.js';

const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);

function ring(pct, size = 44) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return h('div.ring', {
    html: `<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="${r}" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="4"/>
<circle cx="22" cy="22" r="${r}" fill="none" stroke="url(#ringg)" stroke-width="4" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}"/>
<defs><linearGradient id="ringg"><stop offset="0" stop-color="#0a6cff"/><stop offset="1" stop-color="#10a310"/></linearGradient></defs></svg><span>${Math.round(pct)}%</span>`,
    style: { width: `${size / 16}rem`, height: `${size / 16}rem` },
  });
}

export function homeScreen() {
  let tab = 'games';
  let focusedId = null;
  let heroTimer = null;
  const unsubs = [];

  // ---------- Hintergrund ----------
  const heroA = h('div.hero-img');
  const heroB = h('div.hero-img');
  let heroFront = heroA;
  const canvas = h('canvas.ambient');
  const bg = h('div.home-bg', heroA, heroB, canvas, h('div.hero-shade'), h('div.hero-blur'));
  const ambient = new Ambient(canvas, { bokeh: 12, dust: 60 });

  function setHero(item) {
    clearTimeout(heroTimer);
    heroTimer = setTimeout(() => {
      const url = artFor(item, 'hero');
      if (heroFront.dataset.url === url) return;
      const back = heroFront === heroA ? heroB : heroA;
      back.style.backgroundImage = `url("${url}")`;
      back.dataset.url = url;
      back.classList.add('show');
      heroFront.classList.remove('show');
      heroFront = back;
    }, 90);
  }

  // ---------- Kopfzeile ----------
  const tabGames = h('button.home-tab.nav.active', 'Spiele');
  const tabMedia = h('button.home-tab.nav', 'Medien');
  const bellBadge = h('span.badge', { style: { display: 'none' } });
  const avatarSlot = h('span');
  const nameEl = h('span.ta-name');
  const scoreEl = h('span.ta-score');
  const topAvatar = h('button.top-avatar.nav', { 'aria-label': 'Profil & System' }, avatarSlot, h('span', { style: { display: 'grid' } }, nameEl, scoreEl));
  const top = h(
    'header.home-top',
    h('nav.home-tabs', { dataset: { group: '' } }, tabGames, tabMedia),
    h(
      'div.top-right',
      { dataset: { group: '' } },
      h('button.icon-btn.nav', { 'aria-label': 'Suche', onclick: () => screens.go('search') }, icon('search')),
      h('button.icon-btn.nav', { 'aria-label': 'Benachrichtigungen', onclick: () => openGuide({ tab: 'notifications' }) }, icon('bell'), bellBadge),
      h('button.icon-btn.nav', { 'aria-label': 'Einstellungen', onclick: () => openApp('settings') }, icon('settings')),
      topAvatar,
      clockEl('home-clock'),
    ),
  );
  topAvatar.addEventListener('click', () => openGuide({ tab: 'profile' }));

  function renderUser() {
    const u = store.get('user');
    if (!u) return;
    clear(avatarSlot).append(avatarEl(u.avatar, { status: u.status === 'invisible' ? 'offline' : u.status }));
    nameEl.textContent = u.displayName;
    scoreEl.textContent = `${u.score} XP`;
    const unread = store.get('notifications').filter((n) => !n.read).length;
    bellBadge.textContent = unread;
    bellBadge.style.display = unread ? '' : 'none';
  }

  function switchTab(next) {
    if (tab === next) return;
    tab = next;
    tabGames.classList.toggle('active', tab === 'games');
    tabMedia.classList.toggle('active', tab === 'media');
    row.classList.add('swap');
    setTimeout(() => {
      focusedId = null;
      renderRow();
      row.classList.remove('swap');
      const first = row.querySelector('.tile');
      if (first) selectTile(first, false);
    }, 220);
  }
  tabGames.addEventListener('click', () => switchTab('games'));
  tabMedia.addEventListener('click', () => switchTab('media'));

  // ---------- Kachelreihe ----------
  const row = h('div.home-row', { dataset: { group: '', remember: '', trap: 'x' } });

  function rowItems() {
    if (tab === 'media') return [APPS.browser, APPS.music, APPS.friends, APPS.achievements, APPS.settings];
    const owned = library.owned();
    const ordered = [...owned.filter((g) => library.isInstalled(g.id)), ...owned.filter((g) => !library.isInstalled(g.id))];
    return [APPS.store, ...ordered, APPS.library];
  }

  function renderRow() {
    clear(row);
    rowItems().forEach((item, idx) => {
      const isGame = item.kind !== 'app';
      const installed = isGame ? library.isInstalled(item.id) : true;
      const art = h('div.tile-art', { style: { backgroundImage: `url("${artFor(item, 'square')}")` } });
      if (isGame) art.append(h('div.tile-name', { class: `t-${item.titleStyle}` }, item.title));
      const tile = h(
        'button.tile.nav',
        { class: installed ? '' : 'not-installed', 'aria-label': item.title, dataset: { id: item.id, idx: String(idx) } },
        art,
        h('span.tile-label', item.title),
      );
      tile.addEventListener('navfocus', () => selectTile(tile, true));
      tile.addEventListener('click', () => activate(item));
      row.append(tile);
    });
    if (focusedId) {
      const again = row.querySelector(`[data-id="${focusedId}"]`);
      if (again) {
        updateRowOffset(Number(again.dataset.idx));
        if (nav.current && !nav.current.isConnected) nav.focus(again, { silent: true });
      }
    }
  }

  function updateRowOffset(idx) {
    const step = (7.25 + 1) * rem();
    row.style.transform = `translateX(${-Math.max(0, idx - 1) * step}px)`;
  }

  function currentItem() {
    return rowItems().find((i) => i.id === focusedId) || rowItems()[0];
  }

  function selectTile(tile, fromFocus) {
    const id = tile.dataset.id;
    updateRowOffset(Number(tile.dataset.idx));
    if (id === focusedId && fromFocus) return;
    focusedId = id;
    const item = currentItem();
    setHero(item);
    renderInfo(item);
    renderCards(item);
  }

  // ---------- Info ----------
  const info = h('section.home-info');

  function renderInfo(item) {
    clear(info);
    const isGame = item.kind !== 'app';
    const main = h('div.info-main');
    const side = h('div.info-side');
    if (isGame) {
      const installed = library.isInstalled(item.id);
      const dl = store.get('downloads').find((d) => d.id === item.id);
      main.append(
        h('h1.info-title', { class: `t-${item.titleStyle}` }, item.title),
        h(
          'div.info-meta',
          h('span', item.genre),
          h('span', '·'),
          h('span', item.studio),
          h('span', '·'),
          h('span', String(item.year)),
          h('span.pill-tag', item.age),
          h('span.pill-tag.blue', 'Fiktives Spiel'),
        ),
      );
      let primary;
      if (dl) {
        primary = h('div.dl-progress', icon('download'), h('div.bar', h('div', { style: { width: `${Math.round(dl.progress * 100)}%` } })), `${Math.round(dl.progress * 100)} %`);
      } else if (installed) {
        primary = h('button.btn.btn-lg.btn-play.nav', { onclick: () => launchGame(item) }, icon('play'), 'Spielen');
      } else {
        primary = h('button.btn.btn-lg.btn-play.btn-primary.nav', { onclick: () => startDownload(item.id) }, icon('download'), 'Herunterladen');
      }
      main.append(
        h(
          'div.info-actions',
          { dataset: { group: '' } },
          primary,
          h('button.btn.btn-lg.btn-icon.nav', { 'aria-label': 'Optionen', onclick: () => gameOptions(item) }, icon('ellipsis')),
        ),
      );
      side.append(
        h(
          'div.stat-card.acrylic',
          h('div.stat-row', ring(item.progress, 68), h('div', h('div.s-label', 'Spielfortschritt'), h('div.s-value', `${item.progress} %`))),
          h('div.stat-row', icon('trophy'), h('div', h('div.s-label', 'Erfolge'), h('div.s-value', `${item.trophies[0]} / ${item.trophies[1]}`))),
          h('div.stat-row', icon('hard-drive'), h('div', h('div.s-label', installed ? 'Belegter Speicher' : 'Downloadgröße'), h('div.s-value', item.size))),
        ),
      );
    } else {
      main.append(
        h('h1.info-title', { style: { fontWeight: 300 } }, item.title),
        h('div.info-desc', item.desc),
        h(
          'div.info-actions',
          { dataset: { group: '' } },
          h('button.btn.btn-lg.btn-play.nav', { onclick: () => activate(item) }, icon('arrow-right'), 'Öffnen'),
        ),
      );
      const u = store.get('user');
      const friends = store.get('friends').friends;
      side.append(
        h(
          'div.stat-card.acrylic',
          h('div.stat-row', icon('users'), h('div', h('div.s-label', 'Freunde online'), h('div.s-value', `${friends.filter((f) => f.online).length} / ${friends.length}`))),
          h('div.stat-row', icon('trophy'), h('div', h('div.s-label', 'Deine X-Punkte'), h('div.s-value', `${u?.score ?? 0} XP`))),
          h('div.stat-row', icon('disc-3'), h('div', h('div.s-label', 'Musik'), h('div.s-value', store.get('music').playing ? store.get('music').title : 'Aus'))),
        ),
      );
    }
    info.append(main, side);
  }

  async function gameOptions(item) {
    const installed = library.isInstalled(item.id);
    const choice = await dialog({
      title: item.title,
      text: `${item.genre} von ${item.studio} (fiktiv). ${item.desc}`,
      actions: [
        { label: 'Im Store ansehen', value: 'store', icon: 'shopping-bag' },
        installed ? { label: 'Deinstallieren', value: 'remove', icon: 'trash' } : { label: 'Herunterladen', value: 'download', icon: 'download' },
        { label: 'Schließen', value: null, primary: true },
      ],
    });
    if (choice === 'store') screens.go('product', { id: item.id });
    if (choice === 'remove') library.set(item.id, { installed: false });
    if (choice === 'download') startDownload(item.id);
  }

  function activate(item) {
    if (item.kind === 'app') return openApp(item.id);
    if (library.isInstalled(item.id)) return launchGame(item);
    if (store.get('downloads').some((d) => d.id === item.id)) return;
    startDownload(item.id);
  }

  // ---------- Hub-Karten ----------
  const cardsSection = h('section.home-section');

  function card({ kicker, kIcon, title, sub, art, progress, onClick, cls = '' }) {
    const el = h(
      'button.hub-card.nav',
      { class: cls },
      h('div.hc-art', { style: { backgroundImage: `url("${art}")` } }),
      h('div.hc-shade'),
      h(
        'div.hc-body',
        h('div.hc-kicker', kIcon ? icon(kIcon) : null, kicker),
        h('div.hc-title', title),
        sub ? h('div.hc-sub', sub) : null,
        progress != null ? h('div.bar', h('div', { style: { width: `${progress}%` } })) : null,
      ),
    );
    el.addEventListener('click', onClick);
    return el;
  }

  function cardsFor(item) {
    if (item.kind !== 'app') {
      const art = gameArt(item, 'wide');
      const list = item.activities.slice(0, 2).map((a, i) =>
        card({ kicker: 'Aktivität', kIcon: 'flag', title: a, sub: i === 0 ? 'Weiterspielen' : 'Neue Herausforderung', art, progress: i === 0 ? item.progress : null, onClick: () => activate(item) }),
      );
      list.push(
        card({
          kicker: 'Erfolge',
          kIcon: 'trophy',
          title: `${item.trophies[0]} von ${item.trophies[1]} freigeschaltet`,
          art: gameArt(item, 'hero'),
          progress: Math.round((item.trophies[0] / item.trophies[1]) * 100),
          onClick: () => openApp('achievements'),
        }),
        card({
          kicker: 'Neuigkeiten',
          kIcon: 'newspaper',
          title: item.news,
          sub: `${item.studio} · fiktive Meldung`,
          art: gameArt(item, 'square'),
          onClick: () => dialog({ title: item.news, text: [`Eine (fiktive) Meldung von ${item.studio}.`, 'Alle Spiele in X-Station sind erfundene Platzhalter und können nicht gespielt werden.'], iconName: 'newspaper' }),
        }),
      );
      return { title: 'Hub', list };
    }
    const featured = GAMES.filter((g) => !library.isOwned(g.id));
    switch (item.id) {
      case 'store':
        return {
          title: 'Im Store hervorgehoben',
          list: (featured.length ? featured : GAMES).slice(0, 4).map((g) =>
            card({ kicker: library.isOwned(g.id) ? 'In deiner Sammlung' : 'Kostenlos', kIcon: 'shopping-bag', title: g.title, sub: g.genre, art: gameArt(g, 'wide'), onClick: () => screens.go('product', { id: g.id }) }),
          ),
        };
      case 'library':
        return {
          title: 'Deine Spiele',
          list: [
            card({ kicker: 'Installiert', kIcon: 'hard-drive', title: `${library.installed().length} Spiele`, sub: 'Bereit zum (Nicht-)Spielen', art: appArt(APPS.library), onClick: () => openApp('library') }),
            card({ kicker: 'Sammlung', kIcon: 'layout-grid', title: `${library.owned().length} von ${GAMES.length} Spielen`, art: appArt(APPS.store), onClick: () => openApp('library') }),
          ],
        };
      case 'browser':
        return {
          title: 'Schnellzugriff',
          list: [
            ['Wikipedia', 'https://de.wikipedia.org/'],
            ['DuckDuckGo', 'https://duckduckgo.com/'],
            ['OpenStreetMap', 'https://www.openstreetmap.org/'],
          ].map(([t, url]) =>
            card({ kicker: 'Webseite', kIcon: 'globe', title: t, sub: url.replace(/^https:\/\//, '').replace(/\/$/, ''), art: appArt(APPS.browser), onClick: () => openApp('browser', { url }) }),
          ),
        };
      case 'music':
        return {
          title: 'Sender',
          list: STATIONS.map((st) =>
            card({
              kicker: store.get('music').station === st.id ? 'Läuft gerade' : 'Generative Musik',
              kIcon: 'disc-3',
              title: st.title,
              sub: st.mood,
              art: appArt({ id: `st-${st.id}`, icon: 'disc-3', colors: st.colors }),
              onClick: () => {
                music.toggle(st.id);
                renderCards(item);
              },
            }),
          ),
        };
      case 'friends': {
        const friends = store.get('friends').friends.filter((f) => f.online).slice(0, 3);
        return {
          title: 'Online',
          list: [
            ...friends.map((f) =>
              card({ kicker: STATUS_LABEL[f.status] || 'Online', kIcon: 'user', title: f.displayName, sub: f.activity, art: appArt(APPS.friends), onClick: () => openGuide({ tab: 'friends', userId: f.id }) }),
            ),
            card({ kicker: 'Freunde', kIcon: 'user-plus', title: 'Freund hinzufügen', sub: 'Suche nach Benutzernamen', art: appArt(APPS.friends), onClick: () => openGuide({ tab: 'friends', add: true }) }),
          ],
        };
      }
      case 'achievements': {
        const u = store.get('user');
        const next = ACHIEVEMENTS.filter((a) => !u?.achievements?.[a.id]).slice(0, 3);
        return {
          title: 'Als Nächstes',
          list: next.map((a) => card({ kicker: `${a.points} XP`, kIcon: a.icon, title: a.title, sub: a.desc, art: appArt(APPS.achievements), onClick: () => openApp('achievements') })),
        };
      }
      case 'settings':
        return {
          title: 'Häufig genutzt',
          list: [
            ['Design', 'palette', 'appearance'],
            ['Ton', 'volume-2', 'sound'],
            ['Info & Credits', 'info', 'info'],
          ].map(([t, ic, section]) => card({ kicker: 'Einstellungen', kIcon: ic, title: t, art: appArt(APPS.settings), onClick: () => openApp('settings', { section }) })),
        };
      default:
        return { title: '', list: [] };
    }
  }

  function renderCards(item) {
    const { title, list } = cardsFor(item);
    clear(cardsSection);
    if (!list.length) return;
    cardsSection.append(h('h2', title), h('div.cards-row', { dataset: { group: '', remember: '', trap: 'x' } }, list));
  }

  // ---------- Xbox-Zone ----------
  const xbZone = h('div.xb-zone');

  function renderXbox() {
    clear(xbZone);
    const { friends } = store.get('friends');
    const sorted = [...friends].sort((a, b) => Number(b.online) - Number(a.online));
    const friendTiles = sorted.slice(0, 6).map((f) => {
      const t = h(
        'button.xb-tile.nav',
        h('div.xt-center', avatarEl(f.avatar, { status: f.online ? f.status : 'offline' })),
        h('div.xt-title', f.displayName),
        h('div.xt-sub', f.online ? f.activity || 'Online' : 'Offline'),
      );
      t.addEventListener('click', () => openGuide({ tab: 'friends', userId: f.id }));
      return t;
    });
    const addTile = h(
      'button.xb-tile.accent.nav',
      h('div.xt-center', icon('user-plus')),
      h('div.xt-title', friends.length ? 'Freunde finden' : 'Ersten Freund hinzufügen'),
      h('div.xt-sub', 'Suche nach Benutzernamen'),
    );
    addTile.addEventListener('click', () => openGuide({ tab: 'friends', add: true }));

    const storeTiles = GAMES.filter((g) => !library.isOwned(g.id))
      .concat(GAMES.filter((g) => library.isOwned(g.id)))
      .slice(0, 4)
      .map((g) => {
        const owned = library.isOwned(g.id);
        const t = h(
          'button.xb-tile.wide.nav',
          h('div.xt-art', { style: { backgroundImage: `url("${gameArt(g, 'wide')}")` } }),
          h('div.xt-shade'),
          h('div.xt-top', h('span.price', { class: owned ? 'owned' : '' }, owned ? 'Gekauft' : 'Kostenlos'), null),
          h('div.xt-title', g.title),
          h('div.xt-sub', g.genre),
        );
        t.addEventListener('click', () => screens.go('product', { id: g.id }));
        return t;
      });

    const u = store.get('user');
    const unlocked = Object.keys(u?.achievements || {}).length;
    const m = store.get('music');
    const sysTiles = [
      h(
        'button.xb-tile.accent-blue.nav',
        { onclick: () => openApp('achievements') },
        h('div.xt-center', icon('trophy')),
        h('div.xt-title', `${u?.score ?? 0} XP`),
        h('div.xt-sub', `${unlocked} von ${ACHIEVEMENTS.length} Erfolgen`),
      ),
      h(
        'button.xb-tile.nav',
        { onclick: () => (m.playing ? music.stop() : music.play(m.lastStation || STATIONS[0].id)) },
        h('div.xt-center', icon(m.playing ? 'pause' : 'play')),
        h('div.xt-title', m.playing ? m.title : 'Musik abspielen'),
        h('div.xt-sub', m.playing ? m.mood : 'Generative Ambient-Sender'),
      ),
      h(
        'button.xb-tile.nav',
        { onclick: () => openApp('browser') },
        h('div.xt-center', icon('globe')),
        h('div.xt-title', 'Browser'),
        h('div.xt-sub', 'Im Web surfen'),
      ),
      h(
        'button.xb-tile.nav',
        { onclick: () => toggleControlCenter() },
        h('div.xt-center', icon('sliders-horizontal')),
        h('div.xt-title', 'Control Center'),
        h('div.xt-sub', 'Schnelleinstellungen'),
      ),
    ];

    xbZone.append(
      h('section.home-section', h('h2', icon('users'), 'Freunde'), h('div.xb-grid', { dataset: { group: '', remember: '', trap: 'x' } }, friendTiles, addTile)),
      h('section.home-section', h('h2', icon('shopping-bag'), 'Im Store entdecken'), h('div.xb-grid', { dataset: { group: '', remember: '', trap: 'x' } }, storeTiles)),
      h('section.home-section', h('h2', icon('sparkles'), 'Deine X-Station'), h('div.xb-grid', { dataset: { group: '', remember: '', trap: 'x' } }, sysTiles)),
    );
  }

  // ---------- Aufbau ----------
  const scroll = h('div.home-scroll', { dataset: { noscroll: '' } }, h('div.home-page', top, h('section.home-row-wrap', row), info, cardsSection, xbZone));
  const el = h('div.home-screen', bg, scroll);

  // Vertikales Scrollen: Kopf/Reihe/Info oben, Abschnitte darunter werden eingeblendet
  el.addEventListener('navfocus', (ev) => {
    const target = ev.target;
    const inTop = top.contains(target) || row.contains(target) || info.contains(target);
    if (inTop) {
      scroll.scrollTo({ top: 0, behavior: 'smooth' });
      el.classList.remove('scrolled');
      return;
    }
    const section = target.closest('.home-section');
    if (section) {
      const offset = section.offsetTop - 5 * rem();
      scroll.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
      el.classList.toggle('scrolled', section.closest('.xb-zone') !== null);
    }
  });

  function refreshAll() {
    renderUser();
    renderRow();
    const item = currentItem();
    if (item) {
      renderInfo(item);
      renderCards(item);
    }
    renderXbox();
  }

  return {
    el,
    activity: 'Startseite',
    hints: [
      ['accept', 'Auswählen'],
      ['home', 'Control Center'],
      ['guide', 'Guide'],
    ],
    initialFocus: () => row.querySelector(`[data-id="${focusedId}"]`) || row.querySelector('.tile'),
    onShow() {
      setActivity('Startseite');
      pushRecent({ id: 'home', title: 'Startseite', icon: 'house' });
      refreshAll();
      const first = row.querySelector(`[data-id="${focusedId}"]`) || row.querySelector('.tile');
      if (first) selectTile(first, false);
      ambient.start();
      unsubs.push(
        store.on('user', () => {
          renderUser();
          const item = currentItem();
          if (item?.kind === 'app' && !info.contains(nav.current)) renderInfo(item);
        }),
        store.on('notifications', renderUser),
        store.on('friends', () => {
          renderXbox();
          const item = currentItem();
          if (item?.kind === 'app') {
            renderInfo(item);
            renderCards(item);
          }
        }),
        store.on('downloads', () => {
          const item = currentItem();
          if (item && item.kind !== 'app') {
            const hadFocus = info.contains(nav.current);
            renderInfo(item);
            if (hadFocus) nav.ensure();
          }
        }),
        store.on('music', () => {
          renderXbox();
          const item = currentItem();
          if (item?.id === 'music') renderCards(item);
        }),
        bus.on('library', () => {
          renderRow();
          renderXbox();
          const item = currentItem();
          if (item) {
            renderInfo(item);
            renderCards(item);
          }
          nav.ensure();
        }),
      );
    },
    onHide() {
      ambient.stop();
      unsubs.splice(0).forEach((u) => u());
    },
    onBack() {
      if (scroll.scrollTop > 10) {
        const tile = row.querySelector(`[data-id="${focusedId}"]`) || row.querySelector('.tile');
        nav.focus(tile, { sound: true });
        return true;
      }
      toggleControlCenter();
      return true;
    },
  };
}
