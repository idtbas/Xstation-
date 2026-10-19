// Lokaler Ersatz-Server für den Betrieb ohne Backend (z. B. auf GitHub Pages).
// Alle Konten liegen nur in diesem Browser. Mehrere Tabs tauschen sich per
// BroadcastChannel aus, sodass Freundesliste & Nachrichten lokal testbar sind.

import { TERMS_VERSION } from '../data/legal.js';
import { ACHIEVEMENTS, ACHIEVEMENT_IDS, achievementScore } from '../data/achievements.js';

const KEY = 'xs.localdb';
const AVATARS = Array.from({ length: 16 }, (_, i) => `av${i + 1}`);

class LocalError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadDb() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}

async function hashPw(password, salt) {
  if (crypto.subtle) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 120000, hash: 'SHA-256' },
      key,
      256,
    );
    return btoa(String.fromCharCode(...new Uint8Array(bits)));
  }
  let h = 0;
  for (const c of salt + password) h = (h * 31 + c.charCodeAt(0)) | 0;
  return String(h);
}

export function createLocalBackend() {
  let token = null;
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('xs-local') : null;
  const heartbeats = new Map();
  const listeners = new Set();

  const db = () => {
    const d = loadDb() || {};
    return {
      users: {},
      sessions: {},
      friendships: [],
      requests: [],
      notifications: {},
      messages: {},
      activity: {},
      ...d,
    };
  };
  const write = (d) => localStorage.setItem(KEY, JSON.stringify(d));

  function emit(userId, type, payload) {
    for (const fn of listeners) fn(userId, type, payload);
    channel?.postMessage({ kind: 'event', userId, type, payload });
  }
  channel?.addEventListener('message', (ev) => {
    const m = ev.data;
    if (m.kind === 'event') for (const fn of listeners) fn(m.userId, m.type, m.payload);
    if (m.kind === 'hb') heartbeats.set(m.userId, Date.now());
  });

  function current(d) {
    const s = d.sessions[token];
    const u = s && d.users[s.userId];
    if (!u) throw new LocalError('Bitte melde dich an.', 401);
    return u;
  }

  const pair = (a, b) => (a < b ? [a, b] : [b, a]);
  const areFriends = (d, a, b) => {
    const [x, y] = pair(a, b);
    return d.friendships.some((f) => f.a === x && f.b === y);
  };
  const friendIds = (d, id) => d.friendships.flatMap((f) => (f.a === id ? [f.b] : f.b === id ? [f.a] : []));
  const isOnline = (id) => Date.now() - (heartbeats.get(id) || 0) < 10000;

  function publicUser(u) {
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatar: u.avatar,
      bio: u.bio || '',
      createdAt: u.createdAt,
      score: achievementScore(u.achievements),
      achievementCount: Object.keys(u.achievements || {}).length,
    };
  }
  function presenceOf(d, u) {
    const online = u.status !== 'invisible' && isOnline(u.id);
    return {
      online,
      status: online ? u.status || 'online' : 'offline',
      activity: online ? d.activity[u.id] || 'Startseite' : null,
      lastOnline: u.lastOnline || null,
    };
  }
  function meView(u) {
    return { ...publicUser(u), status: u.status, achievements: u.achievements || {}, termsAccepted: u.termsAccepted, termsVersion: TERMS_VERSION, proxyKey: null };
  }
  function notify(d, userId, type, data) {
    const n = { id: uid(), type, data, createdAt: Date.now(), read: false };
    (d.notifications[userId] ||= []).unshift(n);
    d.notifications[userId].length = Math.min(d.notifications[userId].length, 50);
    emit(userId, 'notification', n);
  }
  function unlock(d, u, id) {
    if (!ACHIEVEMENT_IDS.has(id) || u.achievements[id]) return [];
    u.achievements[id] = Date.now();
    const out = [id];
    if (!u.achievements.platinum && ACHIEVEMENTS.filter((a) => a.id !== 'platinum').every((a) => u.achievements[a.id])) {
      u.achievements.platinum = Date.now();
      out.push('platinum');
    }
    for (const a of out) emit(u.id, 'achievement', { id: a });
    return out;
  }
  function friendAchievements(d, u) {
    const n = friendIds(d, u.id).length;
    if (n >= 1) unlock(d, u, 'first-friend');
    if (n >= 3) unlock(d, u, 'social');
  }
  function makeFriends(d, a, b) {
    const [x, y] = pair(a.id, b.id);
    if (!areFriends(d, a.id, b.id)) d.friendships.push({ a: x, b: y, since: Date.now() });
    d.requests = d.requests.filter((r) => !((r.from === a.id && r.to === b.id) || (r.from === b.id && r.to === a.id)));
    friendAchievements(d, a);
    friendAchievements(d, b);
  }

  // Herzschlag für den lokalen Online-Status
  setInterval(() => {
    const d = db();
    const s = token && d.sessions[token];
    if (s) {
      heartbeats.set(s.userId, Date.now());
      channel?.postMessage({ kind: 'hb', userId: s.userId });
    }
  }, 3000);

  const run = async (fn) => {
    const d = db();
    const result = await fn(d);
    write(d);
    return result;
  };

  return {
    mode: 'local',
    setToken: (t) => (token = t),
    getToken: () => token,
    health: async () => ({ ok: true, mode: 'local', termsVersion: TERMS_VERSION }),

    register: (data) =>
      run(async (d) => {
        const username = String(data.username || '').trim();
        if (!/^[A-Za-z0-9_.-]{3,16}$/.test(username)) throw new LocalError('Der Benutzername muss 3–16 Zeichen lang sein und darf nur Buchstaben, Zahlen, „_“, „.“ und „-“ enthalten.');
        if (String(data.password || '').length < 8) throw new LocalError('Das Passwort muss mindestens 8 Zeichen lang sein.');
        if (data.acceptedTerms !== TERMS_VERSION) throw new LocalError('Du musst die aktuellen Nutzungsbedingungen akzeptieren.');
        if (Object.values(d.users).some((u) => u.username.toLowerCase() === username.toLowerCase())) {
          throw new LocalError('Dieser Benutzername ist bereits vergeben.', 409);
        }
        const salt = uid();
        const u = {
          id: uid(),
          username,
          displayName: String(data.displayName || '').trim().slice(0, 24) || username,
          avatar: AVATARS.includes(data.avatar) ? data.avatar : 'av1',
          bio: '',
          status: 'online',
          createdAt: Date.now(),
          salt,
          hash: await hashPw(data.password, salt),
          achievements: {},
          termsAccepted: { version: TERMS_VERSION, at: Date.now() },
        };
        d.users[u.id] = u;
        unlock(d, u, 'welcome');
        const t = uid();
        d.sessions[t] = { userId: u.id };
        return { token: t, user: meView(u) };
      }),

    login: (data) =>
      run(async (d) => {
        const u = Object.values(d.users).find((x) => x.username.toLowerCase() === String(data.username || '').trim().toLowerCase());
        if (!u || (await hashPw(String(data.password || ''), u.salt)) !== u.hash) {
          throw new LocalError('Benutzername oder Passwort ist falsch.', 401);
        }
        if (data.acceptedTerms === TERMS_VERSION) u.termsAccepted = { version: TERMS_VERSION, at: Date.now() };
        const t = uid();
        d.sessions[t] = { userId: u.id };
        return { token: t, user: meView(u) };
      }),

    logout: () => run((d) => (delete d.sessions[token], { ok: true })),
    me: () => run((d) => meView(current(d))),

    updateMe: (patch) =>
      run((d) => {
        const u = current(d);
        if (patch.displayName !== undefined) u.displayName = String(patch.displayName).trim().slice(0, 24) || u.displayName;
        if (patch.bio !== undefined) u.bio = String(patch.bio).slice(0, 140);
        if (patch.avatar && AVATARS.includes(patch.avatar)) u.avatar = patch.avatar;
        if (patch.status) u.status = patch.status;
        if (patch.acceptedTerms === TERMS_VERSION) u.termsAccepted = { version: TERMS_VERSION, at: Date.now() };
        for (const fid of friendIds(d, u.id)) emit(fid, 'friends', { reason: 'profile' });
        return meView(u);
      }),

    setActivity: (activity) =>
      run((d) => {
        const u = current(d);
        d.activity[u.id] = activity;
        for (const fid of friendIds(d, u.id)) emit(fid, 'presence', { userId: u.id, ...presenceOf(d, u) });
        return { ok: true };
      }),

    changePassword: (cur, next) =>
      run(async (d) => {
        const u = current(d);
        if ((await hashPw(cur, u.salt)) !== u.hash) throw new LocalError('Das aktuelle Passwort ist falsch.', 403);
        if (String(next).length < 8) throw new LocalError('Das Passwort muss mindestens 8 Zeichen lang sein.');
        u.hash = await hashPw(next, u.salt);
        return { ok: true };
      }),

    deleteAccount: (password) =>
      run(async (d) => {
        const u = current(d);
        if ((await hashPw(password, u.salt)) !== u.hash) throw new LocalError('Das Passwort ist falsch.', 403);
        const friends = friendIds(d, u.id);
        d.friendships = d.friendships.filter((f) => f.a !== u.id && f.b !== u.id);
        d.requests = d.requests.filter((r) => r.from !== u.id && r.to !== u.id);
        for (const [t, s] of Object.entries(d.sessions)) if (s.userId === u.id) delete d.sessions[t];
        for (const k of Object.keys(d.messages)) if (k.includes(u.id)) delete d.messages[k];
        delete d.notifications[u.id];
        delete d.users[u.id];
        for (const fid of friends) emit(fid, 'friends', { reason: 'removed' });
        return { ok: true };
      }),

    unlock: (id) =>
      run((d) => {
        const u = current(d);
        return { unlocked: unlock(d, u, id), score: achievementScore(u.achievements) };
      }),

    searchUsers: (q) =>
      run((d) => {
        const u = current(d);
        const s = String(q).toLowerCase();
        const relation = (o) =>
          areFriends(d, u.id, o.id)
            ? 'friend'
            : d.requests.some((r) => r.from === o.id && r.to === u.id)
              ? 'incoming'
              : d.requests.some((r) => r.from === u.id && r.to === o.id)
                ? 'outgoing'
                : 'none';
        return {
          users: Object.values(d.users)
            .filter((o) => o.id !== u.id && (o.username.toLowerCase().includes(s) || o.displayName.toLowerCase().includes(s)))
            .slice(0, 20)
            .map((o) => ({ ...publicUser(o), relation: relation(o) })),
        };
      }),

    getUser: (id) =>
      run((d) => {
        const u = current(d);
        const o = d.users[id];
        if (!o) throw new LocalError('Benutzer nicht gefunden.', 404);
        const friend = areFriends(d, u.id, o.id);
        return { ...publicUser(o), relation: o.id === u.id ? 'self' : friend ? 'friend' : 'none', achievements: o.achievements, ...(friend ? presenceOf(d, o) : {}) };
      }),

    friends: () =>
      run((d) => {
        const u = current(d);
        return {
          friends: friendIds(d, u.id)
            .map((id) => d.users[id])
            .filter(Boolean)
            .map((o) => ({ ...publicUser(o), ...presenceOf(d, o) })),
          incoming: d.requests.filter((r) => r.to === u.id).map((r) => ({ ...publicUser(d.users[r.from]), requestedAt: r.createdAt })),
          outgoing: d.requests.filter((r) => r.from === u.id).map((r) => ({ ...publicUser(d.users[r.to]), requestedAt: r.createdAt })),
        };
      }),

    requestFriend: (target) =>
      run((d) => {
        const u = current(d);
        const o = target.userId
          ? d.users[target.userId]
          : Object.values(d.users).find((x) => x.username.toLowerCase() === String(target.username || '').trim().toLowerCase());
        if (!o) throw new LocalError('Diesen Benutzer gibt es nicht.', 404);
        if (o.id === u.id) throw new LocalError('Du kannst dich nicht selbst als Freund hinzufügen.');
        if (areFriends(d, u.id, o.id)) throw new LocalError('Ihr seid bereits befreundet.', 409);
        if (d.requests.some((r) => r.from === o.id && r.to === u.id)) {
          makeFriends(d, u, o);
          notify(d, o.id, 'friend-accepted', { userId: u.id, displayName: u.displayName, avatar: u.avatar });
          emit(o.id, 'friends', {});
          emit(u.id, 'friends', {});
          return { status: 'friends' };
        }
        if (d.requests.some((r) => r.from === u.id && r.to === o.id)) throw new LocalError('Du hast bereits eine Anfrage gesendet.', 409);
        d.requests.push({ from: u.id, to: o.id, createdAt: Date.now() });
        notify(d, o.id, 'friend-request', { userId: u.id, displayName: u.displayName, avatar: u.avatar });
        emit(o.id, 'friends', {});
        return { status: 'requested' };
      }),

    acceptFriend: (id) =>
      run((d) => {
        const u = current(d);
        const o = d.users[id];
        if (!o || !d.requests.some((r) => r.from === id && r.to === u.id)) throw new LocalError('Keine Freundschaftsanfrage gefunden.', 404);
        makeFriends(d, u, o);
        notify(d, o.id, 'friend-accepted', { userId: u.id, displayName: u.displayName, avatar: u.avatar });
        emit(o.id, 'friends', {});
        emit(u.id, 'friends', {});
        return { ok: true };
      }),

    declineFriend: (id) =>
      run((d) => {
        const u = current(d);
        d.requests = d.requests.filter((r) => !(r.from === id && r.to === u.id));
        emit(id, 'friends', {});
        return { ok: true };
      }),

    cancelRequest: (id) =>
      run((d) => {
        const u = current(d);
        d.requests = d.requests.filter((r) => !(r.from === u.id && r.to === id));
        emit(id, 'friends', {});
        return { ok: true };
      }),

    removeFriend: (id) =>
      run((d) => {
        const u = current(d);
        const [x, y] = pair(u.id, id);
        d.friendships = d.friendships.filter((f) => !(f.a === x && f.b === y));
        emit(id, 'friends', {});
        return { ok: true };
      }),

    notifications: () => run((d) => ({ notifications: d.notifications[current(d).id] || [] })),
    readNotifications: () =>
      run((d) => {
        for (const n of d.notifications[current(d).id] || []) n.read = true;
        return { ok: true };
      }),
    clearNotifications: () =>
      run((d) => {
        d.notifications[current(d).id] = [];
        return { ok: true };
      }),

    conversations: () =>
      run((d) => {
        const u = current(d);
        const reads = u.reads || {};
        return {
          conversations: friendIds(d, u.id)
            .map((fid) => {
              const msgs = d.messages[pair(u.id, fid).join('|')] || [];
              return {
                userId: fid,
                last: msgs[msgs.length - 1] || null,
                unread: msgs.filter((m) => m.from !== u.id && m.at > (reads[fid] || 0)).length,
              };
            })
            .filter((c) => c.last)
            .sort((a, b) => b.last.at - a.last.at),
        };
      }),

    messages: (id) =>
      run((d) => {
        const u = current(d);
        if (!areFriends(d, u.id, id)) throw new LocalError('Nachrichten sind nur unter Freunden möglich.', 403);
        return { messages: (d.messages[pair(u.id, id).join('|')] || []).slice(-100) };
      }),

    sendMessage: (id, text) =>
      run((d) => {
        const u = current(d);
        if (!areFriends(d, u.id, id)) throw new LocalError('Nachrichten sind nur unter Freunden möglich.', 403);
        const clean = String(text || '').trim().slice(0, 500);
        if (!clean) throw new LocalError('Die Nachricht ist leer.');
        const message = { id: uid(), from: u.id, to: id, text: clean, at: Date.now() };
        (d.messages[pair(u.id, id).join('|')] ||= []).push(message);
        u.reads = { ...(u.reads || {}), [id]: message.at };
        emit(id, 'message', message);
        emit(u.id, 'message', message);
        unlock(d, u, 'first-message');
        return { message };
      }),

    readMessages: (id) =>
      run((d) => {
        const u = current(d);
        u.reads = { ...(u.reads || {}), [id]: Date.now() };
        return { ok: true };
      }),

    async events(onEvent, signal) {
      const d = db();
      const me = d.sessions[token]?.userId;
      if (!me) throw new LocalError('Bitte melde dich an.', 401);
      const known = new Map();
      const fn = (userId, type, payload) => {
        if (userId === me) onEvent(type, payload);
      };
      listeners.add(fn);
      onEvent('open', {});
      const timer = setInterval(() => {
        const dd = db();
        for (const fid of friendIds(dd, me)) {
          const o = dd.users[fid];
          if (!o) continue;
          const p = presenceOf(dd, o);
          const sig = `${p.online}|${p.status}|${p.activity}`;
          if (known.get(fid) !== sig) {
            if (known.has(fid)) onEvent('presence', { userId: fid, ...p });
            known.set(fid, sig);
          }
        }
      }, 3000);
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
      clearInterval(timer);
      listeners.delete(fn);
    },
  };
}
