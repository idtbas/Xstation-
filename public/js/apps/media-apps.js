// Musik, Erfolge, Suche und Ruhemodus.

import { h, icon, clear, append } from '../core/dom.js';
import { nav } from '../core/focus.js';
import { screens } from '../core/screens.js';
import { input } from '../core/input.js';
import { store } from '../core/store.js';
import { call } from '../core/api.js';
import { audioContext, play } from '../core/sound.js';
import { unlock, setActivity, library } from '../core/system.js';
import { clockEl, formatDate } from '../core/util.js';
import { music, STATIONS } from '../core/music.js';
import { gameArt } from '../ui/art.js';
import { avatarEl } from '../ui/avatars.js';
import { rowBtn } from '../ui/components.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { GAMES, APPS } from '../data/games.js';
import { openGuide } from './overlays.js';
import { openApp } from './open.js';
import { launchGame } from './launch.js';

function header(title, iconName) {
  return h('header.app-header', h('h1', icon(iconName), title), clockEl('clock'));
}

// ---------- Musik ----------
export function musicScreen() {
  const unsubs = [];
  let vizTimer = null;
  const disc = h('div.disc', h('div.grooves'));
  const titleEl = h('h2');
  const moodEl = h('div.mood');
  const bars = Array.from({ length: 18 }, () => h('span'));
  const viz = h('div.viz', bars);
  const playBtn = h('button.btn.btn-icon.big.btn-primary.nav', { 'aria-label': 'Abspielen/Pause' });
  const prevBtn = h('button.btn.btn-icon.nav', { 'aria-label': 'Vorheriger Sender', onclick: () => (music.prev(), unlock('dj')) }, icon('skip-back'));
  const nextBtn = h('button.btn.btn-icon.nav', { 'aria-label': 'Nächster Sender', onclick: () => (music.next(), unlock('dj')) }, icon('skip-forward'));
  playBtn.addEventListener('click', () => {
    music.toggle();
    unlock('dj');
  });
  const list = h('div.station-list', { dataset: { group: '', remember: '' } });

  function render() {
    const m = store.get('music');
    const st = STATIONS.find((s) => s.id === (m.station || m.lastStation)) || STATIONS[0];
    disc.style.background = `conic-gradient(from 0deg, ${st.colors[0]}, ${st.colors[1]}, ${st.colors[0]})`;
    disc.style.setProperty('--glow', `${st.colors[0]}66`);
    disc.classList.toggle('playing', m.playing);
    titleEl.textContent = st.title;
    moodEl.textContent = m.playing ? `${st.mood} · läuft` : `${st.mood} · pausiert`;
    clear(playBtn).append(icon(m.playing ? 'pause' : 'play'));
    const keep = nav.current?.dataset?.key;
    clear(list);
    for (const s of STATIONS) {
      const row = h(
        'button.station.nav',
        { class: m.station === s.id ? 'playing' : '', dataset: { key: `st-${s.id}` } },
        h('div.s-art', { style: { background: `linear-gradient(135deg, ${s.colors[0]}, ${s.colors[1]})` } }),
        h('div', h('div.s-title', s.title), h('div.s-mood', `${s.mood} · ${s.bpm} BPM`)),
        h('div.s-end', icon(m.station === s.id ? 'pause' : 'play')),
      );
      row.addEventListener('click', () => {
        music.toggle(s.id);
        unlock('dj');
      });
      list.append(row);
    }
    if (keep) {
      const again = list.querySelector(`[data-key="${keep}"]`);
      if (again) nav.focus(again, { silent: true });
    }
    setActivity(m.playing ? `Hört „${st.title}“` : 'In der Musik-App');
  }

  function animateViz() {
    const playing = store.get('music').playing;
    bars.forEach((b, i) => {
      const v = playing ? 15 + Math.abs(Math.sin(Date.now() / (220 + i * 37) + i)) * 85 * (0.6 + Math.random() * 0.4) : 12;
      b.style.height = `${v}%`;
    });
  }

  const el = h(
    'div.app-screen',
    h('div.stage-bg'),
    header('Musik', 'disc-3'),
    h(
      'div.music-body',
      h('div.music-now', disc, titleEl, moodEl, viz, h('div.music-ctrls', { dataset: { group: '' } }, prevBtn, playBtn, nextBtn)),
      h('div', h('div.g-label', { style: { fontSize: '0.85rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 700, margin: '0 0 1rem' } }, 'Generative Sender – live erzeugt, keine Aufnahmen'), list),
    ),
  );
  return {
    el,
    recent: { title: 'Musik', icon: 'disc-3' },
    initialFocus: () => playBtn,
    onShow() {
      audioContext();
      render();
      unsubs.push(store.on('music', render));
      vizTimer = setInterval(animateViz, 140);
    },
    onHide() {
      clearInterval(vizTimer);
      unsubs.splice(0).forEach((u) => u());
    },
  };
}

// ---------- Erfolge ----------
export function achievementsScreen() {
  const unsubs = [];
  const body = h('div.ach-body.scroll-y');
  function render() {
    const u = store.get('user');
    const got = u?.achievements || {};
    const count = Object.keys(got).length;
    const max = ACHIEVEMENTS.reduce((s, a) => s + a.points, 0);
    clear(body).append(
      h(
        'div.ach-summary',
        avatarEl(u.avatar, { size: '6rem' }),
        h(
          'div',
          { style: { flex: '1' } },
          h('div.big', h('b', `${u.score}`), ` / ${max} XP`),
          h('div', { style: { color: 'var(--text-2)', marginTop: '0.25rem' } }, `${count} von ${ACHIEVEMENTS.length} Erfolgen freigeschaltet`),
          h('div.bar', h('div', { style: { width: `${(count / ACHIEVEMENTS.length) * 100}%` } })),
        ),
      ),
      h(
        'div.ach-grid',
        { dataset: { group: '' } },
        ACHIEVEMENTS.map((a) =>
          h(
            'button.ach-card.nav',
            { class: `${got[a.id] ? 'got' : ''} ${a.tier}` },
            h('div.a-icon', icon(got[a.id] ? a.icon : 'lock')),
            h('div', h('div.a-title', a.title), h('div.a-desc', got[a.id] ? `Freigeschaltet am ${formatDate(got[a.id])}` : a.desc), h('div.tier', { class: a.tier }, { bronze: 'Bronze', silver: 'Silber', gold: 'Gold', platinum: 'Platin' }[a.tier])),
            h('div.a-pts', `${a.points} XP`),
          ),
        ),
      ),
    );
  }
  const el = h('div.app-screen', h('div.stage-bg'), header('Erfolge', 'trophy'), body);
  return {
    el,
    recent: { title: 'Erfolge', icon: 'trophy' },
    initialFocus: () => body.querySelector('.nav'),
    onShow() {
      setActivity('Sieht sich Erfolge an');
      render();
      unsubs.push(store.on('user', render));
    },
    onHide() {
      unsubs.splice(0).forEach((u) => u());
    },
  };
}

// ---------- Suche ----------
export function searchScreen() {
  const inputEl = h('input.nav', { placeholder: 'Spiele, Apps und Nutzer suchen', spellcheck: 'false', autocomplete: 'off' });
  const box = h('label.search-box', icon('search'), inputEl);
  const results = h('div.search-results');
  let timer = null;

  async function search() {
    const q = inputEl.value.trim().toLowerCase();
    clear(results);
    if (!q) {
      results.append(h('div.empty-note', 'Tippe einen Suchbegriff ein – z. B. „Neon“, „Browser“ oder den Namen eines Freundes.'));
      return;
    }
    const games = GAMES.filter((g) => `${g.title} ${g.genre} ${g.studio}`.toLowerCase().includes(q));
    const apps = Object.values(APPS).filter((a) => `${a.title} ${a.desc}`.toLowerCase().includes(q));
    const col = (title, items) => h('div', { dataset: { group: '' } }, h('h3', title), items.length ? items : h('div.empty-note', 'Keine Treffer'));
    const gameCol = col(
      'Spiele',
      games.map((g) =>
        rowBtn({
          iconEl: h('span', { style: { width: '2.6rem', height: '2.6rem', borderRadius: '0.5rem', backgroundImage: `url("${gameArt(g, 'square')}")`, backgroundSize: 'cover', flex: 'none' } }),
          title: g.title,
          sub: `${g.genre} · ${library.isInstalled(g.id) ? 'Installiert' : 'Im Store'}`,
          onClick: () => (library.isInstalled(g.id) ? launchGame(g) : screens.go('product', { id: g.id })),
        }),
      ),
    );
    const appCol = col(
      'Apps',
      apps.map((a) => rowBtn({ iconName: a.icon, title: a.title, sub: a.desc, onClick: () => openApp(a.id) })),
    );
    const userCol = col('Nutzer', [h('div.empty-note', 'Suche läuft …')]);
    results.append(gameCol, appCol, userCol);
    try {
      const { users } = await call.searchUsers(q);
      append(clear(userCol), [
        h('h3', 'Nutzer'),
        users.length
          ? users.map((u) =>
              rowBtn({
                iconEl: avatarEl(u.avatar, { size: '2.6rem' }),
                title: u.displayName,
                sub: `@${u.username} · ${{ friend: 'Befreundet', incoming: 'Hat dir eine Anfrage gesendet', outgoing: 'Anfrage gesendet', none: `${u.score} XP` }[u.relation]}`,
                onClick: () => openGuide({ tab: 'friends', ...(u.relation === 'friend' ? { userId: u.id } : { add: true }) }),
              }),
            )
          : h('div.empty-note', 'Keine Nutzer gefunden'),
      ]);
    } catch {
      clear(userCol).append(h('h3', 'Nutzer'), h('div.empty-note', 'Nutzersuche nicht verfügbar'));
    }
  }
  inputEl.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(search, 220);
  });
  inputEl.addEventListener('enter', (ev) => {
    ev.preventDefault();
    search();
    inputEl.blur();
    const first = results.querySelector('.nav');
    if (first) nav.focus(first, { sound: true });
  });

  const el = h('div.app-screen', h('div.stage-bg'), header('Suche', 'search'), h('div.search-body', box, h('div.scroll-y', { style: { flex: '1', minHeight: '0' } }, results)));
  return {
    el,
    recent: { title: 'Suche', icon: 'search' },
    initialFocus: () => inputEl,
    onShow() {
      setActivity('Startseite');
      search();
      requestAnimationFrame(() => inputEl.focus());
    },
  };
}

// ---------- Ruhemodus ----------
export function restScreen() {
  let release = null;
  const el = h('div.rest-screen', h('div.rest-light'), h('div.rest-text', 'Ruhemodus', h('br'), 'Drücke eine Taste oder klicke, um X-Station aufzuwecken.'));
  const wake = () => {
    play('power');
    screens.back();
  };
  el.addEventListener('click', wake);
  return {
    el,
    hints: [],
    onShow() {
      setActivity('Im Ruhemodus');
      music.stop();
      release = input.intercept(() => (wake(), true));
    },
    onHide() {
      release?.();
    },
    onBack: () => (wake(), true),
  };
}
