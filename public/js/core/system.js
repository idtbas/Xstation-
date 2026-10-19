// Systemdienste: Sitzung, Live-Ereignisse, Erfolge, Downloads, Aktivität.

import { api, call } from './api.js';
import { store, bus, load, save } from './store.js';
import { toast, achievementToast } from '../ui/toast.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { GAMES, GAME_BY_ID } from '../data/games.js';

const shownAchievements = new Set();
let eventsCtrl = null;
let activityTimer = null;
let lastActivity = null;

// ---------- Konten auf diesem Gerät (Benutzerauswahl) ----------
export const accounts = {
  list() {
    return load(`xs.accounts.${api.mode}`, []);
  },
  remember(user, token) {
    const list = this.list().filter((a) => a.id !== user.id);
    list.unshift({ id: user.id, username: user.username, displayName: user.displayName, avatar: user.avatar, token });
    save(`xs.accounts.${api.mode}`, list.slice(0, 8));
  },
  update(user) {
    const list = this.list().map((a) => (a.id === user.id ? { ...a, displayName: user.displayName, avatar: user.avatar } : a));
    save(`xs.accounts.${api.mode}`, list);
  },
  forgetToken(id) {
    save(
      `xs.accounts.${api.mode}`,
      this.list().map((a) => (a.id === id ? { ...a, token: null } : a)),
    );
  },
  remove(id) {
    save(
      `xs.accounts.${api.mode}`,
      this.list().filter((a) => a.id !== id),
    );
  },
};

// ---------- Sitzung ----------
export async function startSession(token, user) {
  api.backend.setToken(token);
  store.set('user', user);
  accounts.remember(user, token);
  for (const id of Object.keys(user.achievements || {})) shownAchievements.add(id);
  connectEvents();
  await Promise.allSettled([refreshFriends(), refreshNotifications(), refreshConversations()]);
}

export async function resumeSession(account) {
  api.backend.setToken(account.token);
  const user = await call.me();
  await startSession(account.token, user);
  return user;
}

export async function endSession({ forget = true } = {}) {
  const user = store.get('user');
  eventsCtrl?.abort();
  eventsCtrl = null;
  try {
    await call.logout();
  } catch {
    /* egal */
  }
  if (user && forget) accounts.forgetToken(user.id);
  api.backend.setToken(null);
  store.set('user', null);
  store.set('friends', { friends: [], incoming: [], outgoing: [] });
  store.set('notifications', []);
  store.set('conversations', []);
  lastActivity = null;
}

export async function refreshMe() {
  const me = await call.me();
  store.set('user', me);
  accounts.update(me);
  return me;
}

export async function refreshFriends() {
  const data = await call.friends();
  store.set('friends', data);
  return data;
}

export async function refreshNotifications() {
  const { notifications } = await call.notifications();
  store.set('notifications', notifications);
}

export async function refreshConversations() {
  const { conversations } = await call.conversations();
  store.set('conversations', conversations);
}

// ---------- Live-Ereignisse ----------
function connectEvents() {
  eventsCtrl?.abort();
  const ctrl = new AbortController();
  eventsCtrl = ctrl;
  let delay = 1500;
  const loop = async () => {
    while (!ctrl.signal.aborted) {
      try {
        await api.backend.events(onEvent, ctrl.signal);
        delay = 1500;
      } catch (err) {
        if (ctrl.signal.aborted) return;
        if (err?.status === 401) {
          bus.emit('session-expired');
          return;
        }
      }
      if (ctrl.signal.aborted) return;
      store.set('online', false);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 20000);
    }
  };
  loop();
}

function onEvent(type, data) {
  if (type === 'open') {
    store.set('online', true);
    if (lastActivity) call.setActivity(lastActivity).catch(() => {});
    return;
  }
  if (type === 'presence') {
    const before = store.get('friends').friends.find((x) => x.id === data.userId);
    store.update('friends', (f) => ({
      ...f,
      friends: f.friends.map((fr) => (fr.id === data.userId ? { ...fr, ...data } : fr)),
    }));
    bus.emit('presence', data);
    if (before && !before.online && data.online) {
      toast({ title: `${before.displayName} ist jetzt online`, avatar: before.avatar, sound: 'notify' });
    }
  } else if (type === 'friends') {
    refreshFriends().catch(() => {});
  } else if (type === 'notification') {
    store.update('notifications', (list) => [data, ...list]);
    if (data.type === 'friend-request') {
      toast({ title: 'Freundschaftsanfrage', body: `${data.data.displayName} möchte mit dir befreundet sein.`, avatar: data.data.avatar });
    } else if (data.type === 'friend-accepted') {
      toast({ title: 'Neuer Freund', body: `${data.data.displayName} hat deine Anfrage angenommen.`, avatar: data.data.avatar });
    }
  } else if (type === 'message') {
    bus.emit('message', data);
    const me = store.get('user');
    refreshConversations().catch(() => {});
    if (me && data.from !== me.id && !bus.chatOpenWith?.(data.from)) {
      const fr = store.get('friends').friends.find((x) => x.id === data.from);
      toast({ title: fr ? fr.displayName : 'Neue Nachricht', body: data.text, avatar: fr?.avatar, iconName: 'message-circle' });
    }
  } else if (type === 'achievement') {
    showAchievement(data.id);
    refreshMe().catch(() => {});
  }
}

// ---------- Erfolge ----------
function showAchievement(id) {
  if (shownAchievements.has(id)) return;
  shownAchievements.add(id);
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (a) achievementToast(a);
}

export async function unlock(id) {
  const user = store.get('user');
  if (!user || user.achievements?.[id]) return;
  try {
    const res = await call.unlock(id);
    for (const aid of res.unlocked || []) showAchievement(aid);
    if (res.unlocked?.length) refreshMe().catch(() => {});
  } catch {
    /* offline – später erneut */
  }
}

// ---------- Aktivität (für Freunde sichtbar) ----------
export function setActivity(text) {
  lastActivity = text;
  clearTimeout(activityTimer);
  activityTimer = setTimeout(() => {
    if (store.get('user')) call.setActivity(text).catch(() => {});
  }, 600);
}

// ---------- Bibliothek & Downloads (simuliert) ----------
function libKey() {
  return `xs.library.${store.get('user')?.id || 'guest'}`;
}

export const library = {
  state() {
    const saved = load(libKey(), null);
    if (saved) return saved;
    const initial = { installed: {}, owned: {} };
    for (const g of GAMES) {
      if (g.installed) {
        initial.installed[g.id] = true;
        initial.owned[g.id] = true;
      }
    }
    return initial;
  },
  isInstalled(id) {
    return !!this.state().installed[id];
  },
  isOwned(id) {
    return !!this.state().owned[id];
  },
  set(id, { installed, owned }) {
    const s = this.state();
    if (installed !== undefined) {
      if (installed) s.installed[id] = true;
      else delete s.installed[id];
    }
    if (owned !== undefined) s.owned[id] = owned;
    save(libKey(), s);
    bus.emit('library');
  },
  installed() {
    const s = this.state();
    return GAMES.filter((g) => s.installed[g.id]);
  },
  owned() {
    const s = this.state();
    return GAMES.filter((g) => s.owned[g.id]);
  },
};

export function startDownload(id) {
  const game = GAME_BY_ID[id];
  if (!game || store.get('downloads').some((d) => d.id === id) || library.isInstalled(id)) return;
  library.set(id, { owned: true });
  const sizeGb = parseFloat(game.size.replace(',', '.'));
  const dl = { id, title: game.title, progress: 0, total: sizeGb };
  store.update('downloads', (list) => [...list, dl]);
  toast({ title: 'Download gestartet', body: game.title, iconName: 'download', sound: 'select' });
  const speed = Math.max(0.035, 1.6 / sizeGb) / 10;
  const timer = setInterval(() => {
    const list = store.get('downloads');
    const item = list.find((d) => d.id === id);
    if (!item) return clearInterval(timer);
    const progress = Math.min(1, item.progress + speed * (0.7 + Math.random() * 0.6));
    if (progress >= 1) {
      clearInterval(timer);
      store.set(
        'downloads',
        list.filter((d) => d.id !== id),
      );
      library.set(id, { installed: true, owned: true });
      toast({ title: 'Download abgeschlossen', body: `${game.title} ist jetzt in deiner Bibliothek.`, iconName: 'check' });
      unlock('collector');
    } else {
      store.set(
        'downloads',
        list.map((d) => (d.id === id ? { ...d, progress } : d)),
      );
    }
  }, 300);
}
