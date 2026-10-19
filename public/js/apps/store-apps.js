// Store (simuliert), Produktseite und Spielebibliothek.

import { h, icon, clear } from '../core/dom.js';
import { nav } from '../core/focus.js';
import { screens } from '../core/screens.js';
import { store, bus } from '../core/store.js';
import { library, startDownload, setActivity } from '../core/system.js';
import { clockEl } from '../core/util.js';
import { gameArt } from '../ui/art.js';
import { dialog } from '../ui/dialog.js';
import { GAMES, GAME_BY_ID } from '../data/games.js';
import { launchGame } from './launch.js';

function header(title, iconName) {
  return h('header.app-header', h('h1', icon(iconName), title), clockEl('clock'));
}

// ---------- Store ----------
export function storeScreen() {
  const unsubs = [];
  const featured = GAMES.find((g) => !library.isOwned(g.id)) || GAMES[0];
  const scroll = h('div.store-scroll.scroll-y');

  function render() {
    const keep = nav.current?.dataset?.key;
    clear(scroll);
    const owned = library.isOwned(featured.id);
    const heroBtn = h('button.btn.btn-lg.btn-primary.nav', { dataset: { key: 'hero' } }, icon(owned ? 'arrow-right' : 'download'), owned ? 'Ansehen' : 'Kostenlos holen');
    heroBtn.addEventListener('click', () => screens.go('product', { id: featured.id }));
    const hero = h(
      'section.store-hero',
      h('div.sh-art', { style: { backgroundImage: `url("${gameArt(featured, 'hero')}")` } }),
      h('div.sh-shade'),
      h(
        'div.sh-body',
        h('span.pill-tag.green', 'Empfohlen'),
        h('h2', { class: `t-${featured.titleStyle}` }, featured.title),
        h('p', featured.desc),
        h('div.p-actions', { dataset: { group: '' } }, heroBtn),
      ),
    );
    heroBtn.addEventListener('navfocus', () => hero.classList.add('has-focus'));
    heroBtn.addEventListener('navblur', () => hero.classList.remove('has-focus'));
    const cards = GAMES.map((g) => {
      const ownedG = library.isOwned(g.id);
      const dl = store.get('downloads').find((d) => d.id === g.id);
      const c = h(
        'button.store-card.nav',
        { dataset: { key: `g-${g.id}` } },
        h('div.sc-art', { style: { backgroundImage: `url("${gameArt(g, 'wide')}")` } }, h('span.price', { class: ownedG ? 'owned' : '' }, dl ? `${Math.round(dl.progress * 100)} %` : ownedG ? (library.isInstalled(g.id) ? 'Installiert' : 'Gekauft') : 'Kostenlos')),
        h('div.sc-body', h('div.sc-title', g.title), h('div.sc-sub', `${g.genre} · ${g.size}`)),
      );
      c.addEventListener('click', () => screens.go('product', { id: g.id }));
      return c;
    });
    scroll.append(
      hero,
      h('h2', { style: { fontWeight: 500, fontSize: '1.4rem', color: 'var(--text-2)', margin: '0 0 1.25rem' } }, 'Alle Spiele · alle fiktiv & kostenlos'),
      h('div.store-grid', { dataset: { group: '' } }, cards),
    );
    if (keep) {
      const again = scroll.querySelector(`[data-key="${keep}"]`);
      if (again) nav.focus(again, { silent: true, scroll: false });
    }
  }

  const el = h('div.app-screen.store-screen', h('div.stage-bg'), header('Store', 'shopping-bag'), scroll);
  return {
    el,
    recent: { title: 'Store', icon: 'shopping-bag', sub: 'Fiktive Spiele entdecken' },
    initialFocus: () => scroll.querySelector('.nav'),
    onShow() {
      setActivity('Stöbert im Store');
      render();
      unsubs.push(bus.on('library', render), store.on('downloads', render));
    },
    onHide() {
      unsubs.splice(0).forEach((u) => u());
    },
  };
}

// ---------- Produktseite ----------
export function productScreen({ id }) {
  const game = GAME_BY_ID[id] || GAMES[0];
  const unsubs = [];
  const actions = h('div.p-actions', { dataset: { group: '' } });

  function renderActions() {
    const hadFocus = actions.contains(nav.current);
    clear(actions);
    const installed = library.isInstalled(game.id);
    const dl = store.get('downloads').find((d) => d.id === game.id);
    if (dl) {
      actions.append(h('div.dl-progress', icon('download'), h('div.bar', h('div', { style: { width: `${Math.round(dl.progress * 100)}%` } })), `${Math.round(dl.progress * 100)} %`));
    } else if (installed) {
      actions.append(
        h('button.btn.btn-lg.nav', { onclick: () => launchGame(game) }, icon('play'), 'Spielen'),
        h('button.btn.btn-lg.nav', { onclick: () => library.set(game.id, { installed: false }) }, icon('trash'), 'Deinstallieren'),
      );
    } else {
      actions.append(
        h('button.btn.btn-lg.btn-primary.nav', { onclick: () => startDownload(game.id) }, icon('download'), library.isOwned(game.id) ? 'Herunterladen' : 'Kostenlos herunterladen'),
      );
    }
    actions.append(
      h(
        'button.btn.btn-lg.btn-icon.nav',
        {
          'aria-label': 'Hinweis',
          onclick: () => dialog({ title: 'Fiktives Spiel', text: ['Dieses Spiel existiert nicht. Der Store simuliert nur Downloads – es werden keine Dateien heruntergeladen und keine Zahlungen verarbeitet.'], iconName: 'info' }),
        },
        icon('info'),
      ),
    );
    if (hadFocus) nav.focus(actions.querySelector('.nav'), { silent: true });
  }

  const el = h(
    'div.app-screen',
    h('div.product', h('div.p-bg', { style: { backgroundImage: `url("${gameArt(game, 'hero')}")` } }), h('div.p-shade'), header('Store', 'shopping-bag'), h(
      'div.p-body',
      h('span.pill-tag.blue', 'Fiktives Spiel'),
      h('h2', { class: `t-${game.titleStyle}` }, game.title),
      h('div.info-meta', h('span', game.genre), h('span', '·'), h('span', game.studio), h('span.pill-tag', game.age), h('span.price', library.isOwned(game.id) ? 'In deiner Sammlung' : 'Kostenlos')),
      h('p.p-desc', game.desc),
      actions,
      h(
        'div.p-facts',
        h('div', h('b', 'Studio'), `${game.studio} (fiktiv)`),
        h('div', h('b', 'Erscheinungsjahr'), String(game.year)),
        h('div', h('b', 'Größe'), game.size),
        h('div', h('b', 'Erfolge'), `${game.trophies[1]} Erfolge`),
        h('div', h('b', 'Alter'), game.age),
        h('div', h('b', 'Neuigkeiten'), game.news),
      ),
    )),
  );
  el.querySelector('.product').style.display = 'flex';
  el.querySelector('.product').style.flexDirection = 'column';

  return {
    el,
    recent: { title: game.title, icon: 'shopping-bag', sub: 'Store' },
    initialFocus: () => actions.querySelector('.nav'),
    onShow() {
      setActivity('Stöbert im Store');
      renderActions();
      unsubs.push(bus.on('library', renderActions), store.on('downloads', renderActions));
    },
    onHide() {
      unsubs.splice(0).forEach((u) => u());
    },
  };
}

// ---------- Bibliothek ----------
export function libraryScreen() {
  let tab = 'installed';
  const unsubs = [];
  const grid = h('div.lib-grid', { dataset: { group: '' } });
  const tInstalled = h('button.home-tab.nav.active', 'Installiert');
  const tAll = h('button.home-tab.nav', 'Deine Sammlung');
  const tStore = h('button.home-tab.nav', 'Alle Spiele');
  const tabBtns = [
    [tInstalled, 'installed'],
    [tAll, 'owned'],
    [tStore, 'all'],
  ];
  for (const [b, id] of tabBtns) {
    b.addEventListener('click', () => {
      tab = id;
      tabBtns.forEach(([x, xid]) => x.classList.toggle('active', xid === id));
      render();
    });
  }

  function render() {
    clear(grid);
    const list = tab === 'installed' ? library.installed() : tab === 'owned' ? library.owned() : GAMES;
    if (!list.length) grid.append(h('div.empty-note', { style: { gridColumn: '1 / -1' } }, 'Hier ist noch nichts. Lade im Store ein (fiktives) Spiel herunter!'));
    for (const g of list) {
      const installed = library.isInstalled(g.id);
      const item = h(
        'button.lib-item.nav',
        { class: installed ? '' : 'dim' },
        h('div.li-art', { style: { backgroundImage: `url("${gameArt(g, 'square')}")` } }, h('div.tile-name', { class: `t-${g.titleStyle}` }, g.title)),
        h('div.li-title', g.title),
        h('div.li-sub', installed ? `Installiert · ${g.size}` : library.isOwned(g.id) ? 'Nicht installiert' : 'Im Store'),
      );
      item.addEventListener('click', () => (installed ? launchGame(g) : screens.go('product', { id: g.id })));
      grid.append(item);
    }
  }

  const el = h(
    'div.app-screen',
    h('div.stage-bg'),
    header('Spielebibliothek', 'layout-grid'),
    h('div.lib-tabs', { dataset: { group: '' } }, tInstalled, tAll, tStore),
    h('div.scroll-y', { style: { flex: '1', minHeight: '0', padding: '0.5rem 5rem 5rem' } }, grid),
  );
  return {
    el,
    recent: { title: 'Spielebibliothek', icon: 'layout-grid' },
    hints: [
      ['accept', 'Spielen'],
      ['back', 'Zurück'],
      ['lb', 'Reiter'],
      ['rb', 'Reiter'],
    ],
    onAction(action) {
      if (action !== 'lb' && action !== 'rb') return false;
      const idx = tabBtns.findIndex(([, id]) => id === tab);
      const [btn] = tabBtns[(idx + (action === 'rb' ? 1 : tabBtns.length - 1)) % tabBtns.length];
      btn.click();
      const first = grid.querySelector('.nav');
      if (first) nav.focus(first, { silent: true });
      return true;
    },
    initialFocus: () => grid.querySelector('.nav') || tInstalled,
    onShow() {
      setActivity('In der Spielebibliothek');
      render();
      unsubs.push(bus.on('library', render));
    },
    onHide() {
      unsubs.splice(0).forEach((u) => u());
    },
  };
}
