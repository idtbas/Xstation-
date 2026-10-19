// Eingebauter Webbrowser mit Tabs. Seiten laufen über den X-Station-Proxy in einer
// isolierten Sandbox (oder im lokalen Modus direkt, falls die Seite das erlaubt).

import { h, icon, clear } from '../core/dom.js';
import { nav } from '../core/focus.js';
import { input } from '../core/input.js';
import { screens } from '../core/screens.js';
import { store, prefs, bus, load, save } from '../core/store.js';
import { api } from '../core/api.js';
import { play } from '../core/sound.js';
import { unlock, setActivity } from '../core/system.js';
import { logoFull } from '../ui/logo.js';
import { SPEED_DIAL, resolveInput } from '../data/sites.js';
import { toggleControlCenter } from './overlays.js';
import { dialog } from '../ui/dialog.js';
import { rowBtn } from '../ui/components.js';
import { toast } from '../ui/toast.js';
import { openKeyboard, keyboardForInput } from '../ui/osk.js';

const START = 'xs://start';
let tabSeq = 0;

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function browserScreen({ url } = {}) {
  const user = store.get('user');
  const historyKey = `xs.browser.history.${user?.id}`;
  const useProxy = () => api.mode === 'server' && prefs.get('browserProxy') && user?.proxyKey;
  const tabs = [];
  let active = null;
  const unsubs = [];

  // ---------- Kopfbereich ----------
  const tabStrip = h('div.br-tabs', { dataset: { group: '', trap: 'x' } });
  const urlInput = h('input.nav', { spellcheck: 'false', autocomplete: 'off', placeholder: 'Suchen oder Adresse eingeben', 'aria-label': 'Adresse' });
  const lockIcon = h('span');
  const urlBox = h('label.br-url', lockIcon, urlInput);
  const progress = h('div.br-progress');
  const btnBack = h('button.icon-btn.nav', { 'aria-label': 'Zurück', title: 'Zurück' }, icon('arrow-left'));
  const btnFwd = h('button.icon-btn.nav', { 'aria-label': 'Vorwärts', title: 'Vorwärts' }, icon('arrow-right'));
  const btnReload = h('button.icon-btn.nav', { 'aria-label': 'Neu laden', title: 'Neu laden' }, icon('rotate-cw'));
  const btnHome = h('button.icon-btn.nav', { 'aria-label': 'Startseite', title: 'Startseite' }, icon('house'));
  const btnExt = h('button.icon-btn.nav', { 'aria-label': 'In neuem Browserfenster öffnen', title: 'In neuem Fenster öffnen' }, icon('external-link'));
  const btnClose = h('button.icon-btn.nav', { 'aria-label': 'Browser schließen', title: 'Browser schließen' }, icon('x'));
  const bar = h('div.br-bar', { dataset: { group: '', trap: 'x' } }, btnBack, btnFwd, btnReload, btnHome, urlBox, btnExt, btnClose);
  const top = h('div.br-top', { style: { position: 'relative' } }, tabStrip, bar, progress);
  const view = h('div.br-view');
  const frameNav = h('div.nav-frame.nav', { tabindex: '-1', 'aria-label': 'Webseite', dataset: { silent: '' } });

  // Controller-Cursor (wie im Konsolen-Browser): linker Stick bewegt, A klickt
  const cursor = h('div.br-cursor');
  const cursorPos = { x: 0, y: 0, placed: false };
  let lastHover = 0;
  let hoverTimer = null;
  let clickHintShown = false;

  function cursorActive() {
    return nav.current === frameNav && input.type === 'gamepad' && active && active.url !== START;
  }

  function syncCursor() {
    const on = cursorActive();
    input.stickMode = on ? 'cursor' : 'nav';
    cursor.classList.toggle('show', on);
    if (on && !cursorPos.placed) {
      cursorPos.x = view.clientWidth / 2;
      cursorPos.y = view.clientHeight / 2;
      cursorPos.placed = true;
      renderCursor();
    }
  }

  function renderCursor() {
    cursor.style.transform = `translate(${cursorPos.x}px, ${cursorPos.y}px)`;
  }

  function moveCursor({ x, y, mag, dt }) {
    if (!cursorActive()) return;
    const speed = (220 + 1500 * mag * mag) * (prefs.get('cursorSpeed') || 1);
    const w = view.clientWidth;
    const hgt = view.clientHeight;
    let nx = cursorPos.x + x * speed * dt;
    let ny = cursorPos.y + y * speed * dt;
    // Am Rand weiterdrücken scrollt die Seite
    if (ny < 4 && y < 0) scrollPage(y * speed * dt, false);
    if (ny > hgt - 4 && y > 0) scrollPage(y * speed * dt, false);
    cursorPos.x = Math.max(2, Math.min(w - 2, nx));
    cursorPos.y = Math.max(2, Math.min(hgt - 2, ny));
    renderCursor();
    if (!useProxy()) return;
    const now = performance.now();
    const send = () => {
      lastHover = performance.now();
      post({ xs: 'hover', x: cursorPos.x, y: cursorPos.y });
    };
    clearTimeout(hoverTimer);
    if (now - lastHover > 60) send();
    else hoverTimer = setTimeout(send, 70); // letzte Position nachreichen
  }

  function post(msg) {
    active?.frame?.contentWindow?.postMessage(msg, '*');
  }

  function cursorClick() {
    cursor.classList.remove('click');
    void cursor.offsetWidth;
    cursor.classList.add('click');
    play('select');
    if (!useProxy()) {
      if (!clickHintShown) {
        clickHintShown = true;
        toast({ title: 'Klicks per Controller nicht möglich', body: 'Im lokalen Modus ohne Proxy kann X-Station nicht in Webseiten klicken.', iconName: 'gamepad-2', force: true });
      }
      return;
    }
    post({ xs: 'click', x: cursorPos.x, y: cursorPos.y });
  }

  function switchTab(dir) {
    if (tabs.length < 2) return;
    const idx = tabs.indexOf(active);
    setActive(tabs[(idx + dir + tabs.length) % tabs.length]);
    play('move');
  }

  async function browserMenu() {
    const items = [
      ['new', 'plus', 'Neuer Tab'],
      ['reload', 'rotate-cw', 'Neu laden'],
      ['fwd', 'arrow-right', 'Vorwärts'],
      ['home', 'house', 'Startseite'],
      ['ext', 'external-link', 'Im neuen Fenster öffnen'],
      ['closetab', 'x', 'Tab schließen'],
      ['quit', 'log-out', 'Browser schließen'],
    ];
    const choice = await dialog({
      title: 'Browser',
      text: active && active.url !== START ? active.title : 'Neuer Tab',
      content: (close) => h('div', { dataset: { group: '' } }, items.map(([value, ic, title]) => rowBtn({ iconName: ic, title, onClick: () => close(value) }))),
      actions: [{ label: 'Abbrechen', value: null }],
      initial: () => document.querySelector('.dialog .row-btn'),
    });
    if (choice === 'new') {
      newTab();
      focusAddress();
    } else if (choice === 'reload') btnReload.click();
    else if (choice === 'fwd') goHistory(1);
    else if (choice === 'home') btnHome.click();
    else if (choice === 'ext') btnExt.click();
    else if (choice === 'closetab' && active) closeTab(active);
    else if (choice === 'quit') screens.back();
  }

  function focusAddress() {
    const target = active?.url === START ? active.dial?.querySelector('input') : urlInput;
    if (!target) return;
    nav.focus(target, { sound: true });
    if (input.type === 'gamepad') keyboardForInput(target);
    else target.focus();
  }

  urlInput.addEventListener('focus', () => {
    urlBox.classList.add('focused-within');
    requestAnimationFrame(() => urlInput.select());
  });
  urlInput.addEventListener('blur', () => urlBox.classList.remove('focused-within'));
  urlInput.addEventListener('enter', (ev) => {
    ev.preventDefault();
    const target = resolveInput(urlInput.value, prefs.get('searchEngine'));
    if (target) {
      navigate(active, target);
      urlInput.blur();
      nav.focus(frameNav, { silent: true });
    }
  });

  btnBack.addEventListener('click', () => goHistory(-1));
  btnFwd.addEventListener('click', () => goHistory(1));
  btnReload.addEventListener('click', () => active && navigate(active, active.url, { push: false }));
  btnHome.addEventListener('click', () => active && navigate(active, START));
  btnExt.addEventListener('click', () => {
    if (active && active.url !== START) window.open(active.url, '_blank', 'noopener');
  });
  btnClose.addEventListener('click', () => screens.back());

  // ---------- Tabs ----------
  function newTab(startUrl = START, activate = true) {
    const tab = { id: ++tabSeq, url: START, title: 'Neuer Tab', favicon: null, history: [], index: -1, frame: null, dial: null };
    tabs.push(tab);
    if (activate) setActive(tab);
    navigate(tab, startUrl);
    renderTabs();
    return tab;
  }

  function closeTab(tab) {
    const idx = tabs.indexOf(tab);
    tab.frame?.remove();
    tab.dial?.remove();
    tabs.splice(idx, 1);
    if (!tabs.length) return screens.back();
    if (active === tab) setActive(tabs[Math.min(idx, tabs.length - 1)]);
    renderTabs();
  }

  function setActive(tab) {
    active = tab;
    for (const t of tabs) {
      t.frame?.classList.toggle('hidden', t !== tab || t.url === START);
      if (t.dial) t.dial.style.display = t === tab && t.url === START ? '' : 'none';
    }
    frameNav.style.display = tab.url === START ? 'none' : '';
    if (tab.url === START && nav.current === frameNav) nav.ensure();
    updateBar();
    renderTabs();
    syncCursor();
  }

  function renderTabs() {
    const keep = tabStrip.contains(nav.current) ? nav.current.dataset.key : null;
    clear(tabStrip);
    for (const t of tabs) {
      const closeBtn = h('span.x', { title: 'Tab schließen' }, icon('x'));
      const fav = t.favicon && t.url !== START ? h('img', { src: t.favicon, alt: '', referrerpolicy: 'no-referrer', onerror: (e) => e.target.replaceWith(icon('globe')) }) : icon(t.url === START ? 'sparkles' : 'globe');
      const btn = h('button.br-tab.nav', { class: t === active ? 'active' : '', dataset: { key: `tab-${t.id}` }, title: t.title }, fav, h('span.t', t.title || hostOf(t.url)), closeBtn);
      btn.addEventListener('click', (ev) => {
        if (ev.target.closest('.x')) closeTab(t);
        else setActive(t);
      });
      tabStrip.append(btn);
    }
    const plus = h('button.icon-btn.nav', { 'aria-label': 'Neuer Tab', title: 'Neuer Tab', dataset: { key: 'newtab' } }, icon('plus'));
    plus.addEventListener('click', () => {
      newTab();
      nav.focus(urlInput, { silent: true });
      urlInput.focus();
    });
    tabStrip.append(plus);
    if (keep) {
      const again = tabStrip.querySelector(`[data-key="${keep}"]`);
      if (again) nav.focus(again, { silent: true });
    }
  }

  function updateBar() {
    if (!active) return;
    const isStart = active.url === START;
    if (document.activeElement !== urlInput) urlInput.value = isStart ? '' : active.url;
    clear(lockIcon).append(icon(isStart ? 'search' : active.url.startsWith('https:') ? 'lock' : 'globe'));
    btnBack.style.opacity = active.index > 0 ? '1' : '0.35';
    btnFwd.style.opacity = active.index < active.history.length - 1 ? '1' : '0.35';
  }

  // ---------- Navigation ----------
  function frameSrc(url) {
    return useProxy() ? `/web/${user.proxyKey}/${url}` : url;
  }

  function ensureFrame(tab) {
    if (tab.frame) return tab.frame;
    const frame = h('iframe', {
      title: 'Webseite',
      referrerpolicy: 'no-referrer',
      allow: 'fullscreen; clipboard-write',
      sandbox: useProxy()
        ? 'allow-scripts allow-forms allow-popups allow-modals allow-downloads'
        : 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals',
    });
    frame.addEventListener('load', () => {
      finishProgress();
      if (!useProxy() && tab.url !== START) {
        unlock('surfer');
        showDirectNote();
      }
    });
    tab.frame = frame;
    view.prepend(frame);
    return frame;
  }

  function ensureDial(tab) {
    if (tab.dial) return tab.dial;
    tab.dial = speedDial();
    view.append(tab.dial);
    return tab.dial;
  }

  function navigate(tab, url, { push = true } = {}) {
    if (!tab) return;
    if (push) {
      tab.history = tab.history.slice(0, tab.index + 1);
      if (tab.history[tab.index] !== url) {
        tab.history.push(url);
        tab.index = tab.history.length - 1;
      }
    }
    tab.url = url;
    if (url === START) {
      tab.title = 'Neuer Tab';
      tab.favicon = null;
      ensureDial(tab);
      if (tab.frame) tab.frame.classList.add('hidden');
    } else {
      tab.title = hostOf(url);
      tab.pending = url;
      const frame = ensureFrame(tab);
      frame.src = frameSrc(url);
      startProgress();
      rememberHistory(url);
      setActivity('Surft im Web');
    }
    if (tab === active) setActive(tab);
    renderTabs();
  }

  function goHistory(dir) {
    if (!active) return;
    const next = active.index + dir;
    if (next < 0 || next >= active.history.length) return;
    active.index = next;
    navigate(active, active.history[next], { push: false });
  }

  function startProgress() {
    progress.style.transition = 'none';
    progress.style.opacity = '1';
    progress.style.width = '0';
    requestAnimationFrame(() => {
      progress.style.transition = '';
      progress.style.width = '65%';
    });
  }

  function finishProgress() {
    progress.style.width = '100%';
    setTimeout(() => (progress.style.opacity = '0'), 350);
  }

  let noteShown = false;
  function showDirectNote() {
    if (noteShown) return;
    noteShown = true;
    const note = h(
      'div.br-note',
      'Seite bleibt leer? Viele Webseiten verbieten die Einbettung. ',
      h('button.btn.btn-sm.nav', { onclick: () => btnExt.click() }, icon('external-link'), 'Im neuen Fenster öffnen'),
    );
    view.append(note);
    setTimeout(() => note.remove(), 9000);
  }

  function rememberHistory(url) {
    const list = load(historyKey, []).filter((u) => u !== url);
    list.unshift(url);
    save(historyKey, list.slice(0, 30));
  }

  // Nachrichten aus den Seiten (injiziertes Skript)
  function onMessage(ev) {
    const tab = tabs.find((t) => t.frame && ev.source === t.frame.contentWindow);
    const d = ev.data;
    if (!tab || !d || typeof d !== 'object' || !d.xs) return;
    if (d.xs === 'nav' && typeof d.url === 'string' && /^https?:/i.test(d.url)) {
      if (tab.pending) {
        // Weiterleitung oder geladene Zielseite ersetzt den aktuellen Eintrag
        tab.history[tab.index] = d.url;
        tab.pending = null;
      } else if (tab.history[tab.index] !== d.url) {
        tab.history = tab.history.slice(0, tab.index + 1);
        tab.history.push(d.url);
        tab.index = tab.history.length - 1;
      }
      tab.url = d.url;
      tab.title = String(d.title || '').slice(0, 80) || hostOf(d.url);
      tab.favicon = typeof d.favicon === 'string' && /^https?:/i.test(d.favicon) ? frameSrc(d.favicon) : null;
      if (tab === active) updateBar();
      renderTabs();
      finishProgress();
      unlock('surfer');
    } else if (d.xs === 'open' && typeof d.url === 'string' && /^https?:/i.test(d.url)) {
      newTab(d.url);
      play('open');
    } else if (d.xs === 'hover-info') {
      cursor.classList.toggle('link', !!d.link);
      cursor.classList.toggle('text', !!d.text);
    } else if (d.xs === 'input-focus' && tab === active) {
      openKeyboard({
        value: String(d.value ?? ''),
        label: String(d.label || 'Eingabe').slice(0, 80),
        type: d.inputType === 'password' ? 'password' : d.inputType === 'url' || d.inputType === 'search' ? 'url' : 'text',
        placeholder: String(d.placeholder || ''),
        maxLength: Math.min(5000, Number(d.maxLength) || 2000),
        onInput: (v) => post({ xs: 'set-value', value: v }),
        submitLabel: 'Senden',
      }).then(({ value, submitted }) => {
        post({ xs: 'set-value', value });
        if (submitted) post({ xs: 'submit' });
        nav.focus(frameNav, { silent: true });
        syncCursor();
      });
    } else if (d.xs === 'select' && tab === active && Array.isArray(d.options)) {
      const options = d.options.slice(0, 200).map((text) => String(text).slice(0, 80) || '–');
      dialog({
        title: String(d.label || 'Auswahl').slice(0, 80),
        content: (close) =>
          h(
            'div',
            { dataset: { group: '' } },
            options.map((text, i) => rowBtn({ iconName: i === d.index ? 'check' : 'circle', title: text, cls: i === d.index ? 'selected' : '', onClick: () => close(i) })),
          ),
        actions: [{ label: 'Abbrechen', value: null }],
        cancelValue: null,
        initial: () => document.querySelectorAll('.dialog .row-btn')[Math.max(0, d.index)] || null,
      }).then((i) => {
        if (i != null) post({ xs: 'set-select', index: i });
        nav.focus(frameNav, { silent: true });
      });
    } else if (d.xs === 'key') {
      if (d.key === 'Escape') {
        window.focus();
        nav.focus(urlInput, { silent: true });
        urlInput.blur();
        play('back');
      } else if (d.key === 'Home' || d.key === 'F1') {
        window.focus();
        toggleControlCenter();
      }
    }
  }

  // ---------- Schnellwahl (neuer Tab) ----------
  function speedDial() {
    const search = h('input', { placeholder: 'Im Web suchen oder Adresse eingeben', spellcheck: 'false', autocomplete: 'off' });
    search.classList.add('nav');
    const box = h('label.sd-search', icon('search'), search);
    search.addEventListener('focus', () => box.classList.add('focused-within'));
    search.addEventListener('blur', () => box.classList.remove('focused-within'));
    search.addEventListener('enter', (ev) => {
      ev.preventDefault();
      const target = resolveInput(search.value, prefs.get('searchEngine'));
      if (target) {
        search.value = '';
        search.blur();
        navigate(active, target);
        nav.focus(frameNav, { silent: true });
      }
    });
    const recent = load(historyKey, []).slice(0, 4);
    const tile = (title, url, color) => {
      const t = h('button.sd-tile.nav', h('span.letter', { style: { background: color } }, title[0].toUpperCase()), title);
      t.addEventListener('click', () => navigate(active, url));
      return t;
    };
    return h(
      'div.speed-dial',
      { dataset: { scroll: 'y' } },
      h('div.sd-logo', logoFull({ size: '3rem' })),
      box,
      h('div.sd-grid', { dataset: { group: '' } }, SPEED_DIAL.map((s) => tile(s.title, s.url, s.color))),
      recent.length
        ? h(
            'div',
            { style: { marginTop: '2.5rem', width: 'min(48rem, 90%)' } },
            h('div.g-label', { style: { padding: '0 0 0.5rem', fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 700 } }, 'Zuletzt besucht'),
            h(
              'div',
              { dataset: { group: '' }, style: { display: 'grid', gap: '0.25rem' } },
              recent.map((u) => {
                const b = h('button.row-btn.nav', icon('clock'), h('div.rb-main', h('div.rb-title', hostOf(u)), h('div.rb-sub', u)));
                b.addEventListener('click', () => navigate(active, u));
                return b;
              }),
            ),
          )
        : null,
      h(
        'p.sd-hint',
        useProxy()
          ? 'Webseiten werden über deinen X-Station-Server geladen und laufen isoliert in einer Sandbox. Manche Seiten funktionieren eingeschränkt. Bitte gib hier keine Passwörter oder Zahlungsdaten ein.'
          : 'Lokaler Modus: Seiten werden direkt geladen. Viele Webseiten verbieten das Einbetten – nutze dann „Im neuen Fenster öffnen“.',
      ),
    );
  }

  // ---------- Steuerung per Controller: Seite scrollen ----------
  function scrollPage(dy, smooth = true) {
    active?.frame?.contentWindow?.postMessage({ xs: 'scroll', dy, smooth }, '*');
  }

  frameNav.addEventListener('navfocus', syncCursor);
  frameNav.addEventListener('navblur', () => requestAnimationFrame(syncCursor));

  const el = h('div.app-screen.browser-screen', top, h('div', { style: { flex: '1', minHeight: '0', position: 'relative', display: 'flex' } }, view, frameNav, cursor));
  view.style.flex = '1';

  return {
    el,
    activity: 'Surft im Web',
    recent: { title: 'Browser', icon: 'globe', sub: 'Im Web surfen' },
    hints: [
      ['accept', 'Auswählen'],
      ['back', 'Zurück'],
      ['y', 'Adresse'],
      ['lb', 'Tab'],
      ['rb', 'Tab'],
      ['menu', 'Menü'],
    ],
    initialFocus: () => (active?.url === START ? active.dial?.querySelector('input') : urlInput),
    onShow() {
      setActivity('Surft im Web');
      if (!tabs.length) newTab(url || START);
      window.addEventListener('message', onMessage);
      unsubs.push(
        () => window.removeEventListener('message', onMessage),
        bus.on('cursor', moveCursor),
        bus.on('input-type', syncCursor),
        input.intercept((action, source) => {
          if (nav.current !== frameNav) return false;
          if (active?.url === START) return false;
          if (action === 'down') return scrollPage(window.innerHeight * 0.35), true;
          if (action === 'up') return scrollPage(-window.innerHeight * 0.35), true;
          if (action === 'left' || action === 'right') {
            active?.frame?.contentWindow?.postMessage({ xs: 'scroll', dx: (action === 'right' ? 1 : -1) * window.innerWidth * 0.3, smooth: true }, '*');
            return true;
          }
          if (action === 'accept') {
            if (source === 'gamepad') cursorClick();
            else active?.frame?.focus();
            return true;
          }
          if (action === 'back' && source === 'gamepad') {
            if (active.index > 0) {
              goHistory(-1);
              play('back');
            } else nav.focus(urlInput, { sound: true });
            return true;
          }
          return false;
        }),
      );
      syncCursor();
    },
    onHide() {
      unsubs.splice(0).forEach((u) => u());
      input.stickMode = 'nav';
    },
    onAction(action) {
      if (action === 'y') focusAddress();
      else if (action === 'lb') switchTab(-1);
      else if (action === 'rb') switchTab(1);
      else if (action === 'menu') browserMenu();
      else if ((action === 'lt' || action === 'rt') && active?.url !== START) scrollPage((action === 'rt' ? 1 : -1) * view.clientHeight * 0.85);
      else return false;
      return true;
    },
    onScroll(dx, dy) {
      if (!active || active.url === START) return false;
      active.frame?.contentWindow?.postMessage({ xs: 'scroll', dx, dy, smooth: false }, '*');
      return true;
    },
    onReopen({ url: u } = {}) {
      if (u) newTab(u);
    },
    onBack() {
      if (nav.current === frameNav || view.contains(nav.current)) {
        nav.focus(urlInput, { sound: true });
        return true;
      }
      if (active && active.index > 0 && nav.current !== btnClose) {
        goHistory(-1);
        return true;
      }
      screens.back();
      return true;
    },
  };
}
