// X-Station Server: statische Dateien, REST-API, Live-Ereignisse und Web-Proxy.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Database } from './lib/db.js';
import {
  hashPassword,
  verifyPassword,
  newToken,
  hashToken,
  newId,
  validateUsername,
  validatePassword,
  cleanText,
  RateLimiter,
  AVATARS,
  STATUSES,
} from './lib/auth.js';
import { EventHub } from './lib/events.js';
import { createWebProxy } from './lib/proxy.js';
import { TERMS_VERSION } from '../public/js/data/legal.js';
import { ACHIEVEMENTS, ACHIEVEMENT_IDS, achievementScore } from '../public/js/data/achievements.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_JSON_BYTES = 64 * 1024;
const VERSION = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8')).version;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' blob: data:",
  "frame-src 'self' https: http:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
].join('; ');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function loadSecret(dataDir) {
  if (process.env.XSTATION_SECRET) return process.env.XSTATION_SECRET;
  if (!dataDir) return crypto.randomBytes(32).toString('hex');
  const file = path.join(dataDir, 'secret.key');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    fs.mkdirSync(dataDir, { recursive: true });
    const secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}

export function createApp({ dataDir = null, allowPrivateProxy = false, trustProxy = false } = {}) {
  const db = new Database(dataDir ? path.join(dataDir, 'db.json') : null).load();
  const hub = new EventHub();
  const presence = new Map(); // userId -> { activity, since }
  const proxy = createWebProxy({
    secret: loadSecret(dataDir),
    allowPrivate: allowPrivateProxy,
    userExists: (id) => !!db.userById(id),
  });
  const loginLimiter = new RateLimiter({ limit: 10, windowMs: 10 * 60_000 });
  const registerLimiter = new RateLimiter({ limit: 20, windowMs: 60 * 60_000 });
  const apiLimiter = new RateLimiter({ limit: 600, windowMs: 60_000 });

  // ---------- Hilfsfunktionen ----------
  function clientIp(req) {
    if (trustProxy && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
    return req.socket.remoteAddress || 'unknown';
  }

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

  function presenceOf(u) {
    const visible = u.status !== 'invisible' && hub.isOnline(u.id);
    return {
      online: visible,
      status: visible ? u.status || 'online' : 'offline',
      activity: visible ? presence.get(u.id)?.activity || 'Startseite' : null,
      lastOnline: u.lastOnline || null,
    };
  }

  function friendView(u, viewerId) {
    return { ...publicUser(u), ...presenceOf(u), friendsSince: db.friendshipSince(u.id, viewerId) };
  }

  function relation(viewerId, otherId) {
    if (viewerId === otherId) return 'self';
    if (db.areFriends(viewerId, otherId)) return 'friend';
    if (db.findRequest(otherId, viewerId)) return 'incoming';
    if (db.findRequest(viewerId, otherId)) return 'outgoing';
    return 'none';
  }

  function meView(u) {
    return {
      ...publicUser(u),
      status: u.status || 'online',
      achievements: u.achievements || {},
      termsAccepted: u.termsAccepted || null,
      termsVersion: TERMS_VERSION,
      proxyKey: proxy.keyFor(u.id),
    };
  }

  function notify(userId, type, data) {
    const list = (db.data.notifications[userId] ||= []);
    const n = { id: newId(), type, data, createdAt: Date.now(), read: false };
    list.unshift(n);
    if (list.length > 50) list.length = 50;
    db.save();
    hub.send(userId, 'notification', n);
    return n;
  }

  function broadcastPresence(userId) {
    const u = db.userById(userId);
    if (!u) return;
    const payload = { userId, ...presenceOf(u) };
    for (const fid of db.friendIds(userId)) hub.send(fid, 'presence', payload);
  }

  hub.onPresenceChange = (userId, online) => {
    const u = db.userById(userId);
    if (!u) return;
    if (!online) {
      u.lastOnline = Date.now();
      presence.delete(userId);
      db.save();
    }
    broadcastPresence(userId);
  };

  function unlock(u, id) {
    if (!ACHIEVEMENT_IDS.has(id)) throw new HttpError(404, 'Unbekannter Erfolg.');
    u.achievements ||= {};
    if (u.achievements[id]) return null;
    u.achievements[id] = Date.now();
    const unlocked = [id];
    const others = ACHIEVEMENTS.filter((a) => a.id !== 'platinum');
    if (!u.achievements.platinum && others.every((a) => u.achievements[a.id])) {
      u.achievements.platinum = Date.now();
      unlocked.push('platinum');
    }
    db.save();
    for (const aid of unlocked) hub.send(u.id, 'achievement', { id: aid });
    return unlocked;
  }

  function checkFriendAchievements(u) {
    const count = db.friendIds(u.id).length;
    if (count >= 1) unlock(u, 'first-friend');
    if (count >= 3) unlock(u, 'social');
  }

  function authenticate(req) {
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return null;
    const session = db.data.sessions[hashToken(token)];
    if (!session) return null;
    if (Date.now() - session.lastSeenAt > SESSION_TTL_MS) {
      delete db.data.sessions[hashToken(token)];
      db.save();
      return null;
    }
    const user = db.userById(session.userId);
    if (!user) return null;
    if (Date.now() - session.lastSeenAt > 60_000) {
      session.lastSeenAt = Date.now();
      db.save();
    }
    return { user, tokenHash: hashToken(token) };
  }

  function requireUser(req) {
    const auth = authenticate(req);
    if (!auth) throw new HttpError(401, 'Bitte melde dich an.');
    return auth;
  }

  function createSession(user) {
    const token = newToken();
    db.data.sessions[hashToken(token)] = { userId: user.id, createdAt: Date.now(), lastSeenAt: Date.now() };
    db.save();
    return token;
  }

  async function readJson(req) {
    if (!String(req.headers['content-type'] || '').includes('application/json')) return {};
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_JSON_BYTES) throw new HttpError(413, 'Anfrage zu groß.');
      chunks.push(chunk);
    }
    if (!size) return {};
    try {
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return data && typeof data === 'object' ? data : {};
    } catch {
      throw new HttpError(400, 'Ungültiges JSON.');
    }
  }

  function sendJson(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  }

  function otherUser(id) {
    const u = db.userById(String(id || ''));
    if (!u) throw new HttpError(404, 'Benutzer nicht gefunden.');
    return u;
  }

  function deleteUser(u) {
    const friends = db.friendIds(u.id);
    db.data.friendships = db.data.friendships.filter((f) => f.a !== u.id && f.b !== u.id);
    db.data.requests = db.data.requests.filter((r) => r.from !== u.id && r.to !== u.id);
    for (const [hash, s] of Object.entries(db.data.sessions)) if (s.userId === u.id) delete db.data.sessions[hash];
    for (const key of Object.keys(db.data.messages)) if (key.split('|').includes(u.id)) delete db.data.messages[key];
    delete db.data.notifications[u.id];
    for (const list of Object.values(db.data.notifications)) {
      for (let i = list.length - 1; i >= 0; i--) if (list[i].data?.userId === u.id) list.splice(i, 1);
    }
    delete db.data.users[u.id];
    presence.delete(u.id);
    db.save();
    hub.disconnectUser(u.id);
    for (const fid of friends) hub.send(fid, 'friends', { reason: 'removed', userId: u.id });
  }

  // ---------- Routen ----------
  const routes = [];
  const route = (method, pattern, handler) => {
    const keys = [];
    const re = new RegExp(
      '^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$',
    );
    routes.push({ method, re, keys, handler });
  };

  route('GET', '/api/health', () => ({ ok: true, name: 'X-Station', version: VERSION, mode: 'server', termsVersion: TERMS_VERSION }));

  route('POST', '/api/auth/register', async (req) => {
    if (!registerLimiter.take(clientIp(req))) throw new HttpError(429, 'Zu viele Registrierungen. Bitte später erneut versuchen.');
    const body = await readJson(req);
    const username = String(body.username || '').trim();
    const err = validateUsername(username) || validatePassword(body.password);
    if (err) throw new HttpError(400, err);
    if (body.acceptedTerms !== TERMS_VERSION) throw new HttpError(400, 'Du musst die aktuellen Nutzungsbedingungen akzeptieren.');
    if (db.userByName(username)) throw new HttpError(409, 'Dieser Benutzername ist bereits vergeben.');
    const user = {
      id: newId(),
      username,
      usernameLower: username.toLowerCase(),
      displayName: cleanText(body.displayName, 24) || username,
      passwordHash: await hashPassword(body.password),
      avatar: AVATARS.includes(body.avatar) ? body.avatar : AVATARS[Math.floor(Math.random() * AVATARS.length)],
      bio: '',
      status: 'online',
      createdAt: Date.now(),
      lastOnline: null,
      achievements: {},
      termsAccepted: { version: TERMS_VERSION, at: Date.now() },
    };
    if (db.userByName(username)) throw new HttpError(409, 'Dieser Benutzername ist bereits vergeben.');
    db.data.users[user.id] = user;
    unlock(user, 'welcome');
    const token = createSession(user);
    return { status: 201, body: { token, user: meView(user) } };
  });

  route('POST', '/api/auth/login', async (req) => {
    const body = await readJson(req);
    const username = String(body.username || '').trim();
    if (!loginLimiter.take(clientIp(req) + '|' + username.toLowerCase())) {
      throw new HttpError(429, 'Zu viele Anmeldeversuche. Bitte warte ein paar Minuten.');
    }
    const user = db.userByName(username);
    const ok = user && (await verifyPassword(String(body.password || ''), user.passwordHash));
    if (!ok) throw new HttpError(401, 'Benutzername oder Passwort ist falsch.');
    if (body.acceptedTerms === TERMS_VERSION && user.termsAccepted?.version !== TERMS_VERSION) {
      user.termsAccepted = { version: TERMS_VERSION, at: Date.now() };
    }
    const token = createSession(user);
    return { token, user: meView(user) };
  });

  route('POST', '/api/auth/logout', (req) => {
    const auth = authenticate(req);
    if (auth) {
      delete db.data.sessions[auth.tokenHash];
      db.save();
    }
    return { ok: true };
  });

  route('GET', '/api/me', (req) => meView(requireUser(req).user));

  route('PATCH', '/api/me', async (req) => {
    const { user } = requireUser(req);
    const body = await readJson(req);
    let presenceChanged = false;
    if (body.displayName !== undefined) {
      const name = cleanText(body.displayName, 24);
      if (!name) throw new HttpError(400, 'Der Anzeigename darf nicht leer sein.');
      user.displayName = name;
    }
    if (body.bio !== undefined) user.bio = cleanText(body.bio, 140);
    if (body.avatar !== undefined) {
      if (!AVATARS.includes(body.avatar)) throw new HttpError(400, 'Unbekannter Avatar.');
      user.avatar = body.avatar;
    }
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Unbekannter Status.');
      presenceChanged = user.status !== body.status;
      user.status = body.status;
    }
    if (body.acceptedTerms === TERMS_VERSION) user.termsAccepted = { version: TERMS_VERSION, at: Date.now() };
    db.save();
    for (const fid of db.friendIds(user.id)) hub.send(fid, 'friends', { reason: 'profile', userId: user.id });
    if (presenceChanged) broadcastPresence(user.id);
    return meView(user);
  });

  route('POST', '/api/me/activity', async (req) => {
    const { user } = requireUser(req);
    const body = await readJson(req);
    const activity = cleanText(body.activity, 60) || 'Startseite';
    if (presence.get(user.id)?.activity !== activity) {
      presence.set(user.id, { activity, since: Date.now() });
      broadcastPresence(user.id);
    }
    return { ok: true };
  });

  route('POST', '/api/me/password', async (req) => {
    const { user, tokenHash } = requireUser(req);
    const body = await readJson(req);
    if (!(await verifyPassword(String(body.current || ''), user.passwordHash))) {
      throw new HttpError(403, 'Das aktuelle Passwort ist falsch.');
    }
    const err = validatePassword(body.next);
    if (err) throw new HttpError(400, err);
    user.passwordHash = await hashPassword(body.next);
    for (const [hash, s] of Object.entries(db.data.sessions)) {
      if (s.userId === user.id && hash !== tokenHash) delete db.data.sessions[hash];
    }
    db.save();
    return { ok: true };
  });

  route('DELETE', '/api/me', async (req) => {
    const { user } = requireUser(req);
    const body = await readJson(req);
    if (!(await verifyPassword(String(body.password || ''), user.passwordHash))) {
      throw new HttpError(403, 'Das Passwort ist falsch.');
    }
    deleteUser(user);
    return { ok: true };
  });

  route('POST', '/api/achievements/:id', (req, params) => {
    const { user } = requireUser(req);
    const unlocked = unlock(user, params.id);
    return { unlocked: unlocked || [], score: achievementScore(user.achievements) };
  });

  route('GET', '/api/users/search', (req, params, url) => {
    const { user } = requireUser(req);
    const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
    if (q.length < 1) return { users: [] };
    const users = db
      .allUsers()
      .filter((u) => u.id !== user.id)
      .filter((u) => u.usernameLower.includes(q) || u.displayName.toLowerCase().includes(q))
      .sort((a, b) => (a.usernameLower.startsWith(q) ? -1 : 0) - (b.usernameLower.startsWith(q) ? -1 : 0))
      .slice(0, 20)
      .map((u) => ({ ...publicUser(u), relation: relation(user.id, u.id) }));
    return { users };
  });

  route('GET', '/api/users/:id', (req, params) => {
    const { user } = requireUser(req);
    const other = otherUser(params.id);
    const rel = relation(user.id, other.id);
    const view = { ...publicUser(other), relation: rel, achievements: other.achievements || {} };
    if (rel === 'friend' || rel === 'self') Object.assign(view, presenceOf(other), { friendsSince: db.friendshipSince(user.id, other.id) });
    return view;
  });

  route('GET', '/api/friends', (req) => {
    const { user } = requireUser(req);
    const friends = db
      .friendIds(user.id)
      .map((id) => db.userById(id))
      .filter(Boolean)
      .map((u) => friendView(u, user.id));
    const incoming = db.data.requests
      .filter((r) => r.to === user.id)
      .map((r) => ({ ...publicUser(db.userById(r.from)), requestedAt: r.createdAt }));
    const outgoing = db.data.requests
      .filter((r) => r.from === user.id)
      .map((r) => ({ ...publicUser(db.userById(r.to)), requestedAt: r.createdAt }));
    return { friends, incoming, outgoing };
  });

  route('POST', '/api/friends/request', async (req) => {
    const { user } = requireUser(req);
    const body = await readJson(req);
    const target = body.userId ? db.userById(String(body.userId)) : db.userByName(String(body.username || '').trim());
    if (!target) throw new HttpError(404, 'Diesen Benutzer gibt es nicht.');
    if (target.id === user.id) throw new HttpError(400, 'Du kannst dich nicht selbst als Freund hinzufügen.');
    if (db.areFriends(user.id, target.id)) throw new HttpError(409, 'Ihr seid bereits befreundet.');
    if (db.findRequest(user.id, target.id)) throw new HttpError(409, 'Du hast bereits eine Anfrage gesendet.');
    if (db.data.requests.filter((r) => r.from === user.id).length >= 100) {
      throw new HttpError(429, 'Du hast zu viele offene Anfragen.');
    }
    // Gegenseitige Anfrage → direkt befreundet
    if (db.findRequest(target.id, user.id)) {
      db.removeRequest(target.id, user.id);
      db.addFriendship(user.id, target.id);
      db.save();
      notify(target.id, 'friend-accepted', { userId: user.id, displayName: user.displayName, avatar: user.avatar });
      hub.send(target.id, 'friends', { reason: 'accepted', userId: user.id });
      hub.send(user.id, 'friends', { reason: 'accepted', userId: target.id });
      checkFriendAchievements(user);
      checkFriendAchievements(target);
      return { status: 'friends' };
    }
    db.data.requests.push({ id: newId(), from: user.id, to: target.id, createdAt: Date.now() });
    db.save();
    notify(target.id, 'friend-request', { userId: user.id, displayName: user.displayName, avatar: user.avatar });
    hub.send(target.id, 'friends', { reason: 'request', userId: user.id });
    return { status: 'requested' };
  });

  route('POST', '/api/friends/:id/accept', (req, params) => {
    const { user } = requireUser(req);
    const other = otherUser(params.id);
    if (!db.findRequest(other.id, user.id)) throw new HttpError(404, 'Keine Freundschaftsanfrage gefunden.');
    db.removeRequest(other.id, user.id);
    db.addFriendship(user.id, other.id);
    db.save();
    notify(other.id, 'friend-accepted', { userId: user.id, displayName: user.displayName, avatar: user.avatar });
    hub.send(other.id, 'friends', { reason: 'accepted', userId: user.id });
    hub.send(user.id, 'friends', { reason: 'accepted', userId: other.id });
    checkFriendAchievements(user);
    checkFriendAchievements(other);
    return { ok: true };
  });

  route('POST', '/api/friends/:id/decline', (req, params) => {
    const { user } = requireUser(req);
    const other = otherUser(params.id);
    db.removeRequest(other.id, user.id);
    db.save();
    hub.send(other.id, 'friends', { reason: 'declined', userId: user.id });
    return { ok: true };
  });

  route('POST', '/api/friends/:id/cancel', (req, params) => {
    const { user } = requireUser(req);
    const other = otherUser(params.id);
    db.removeRequest(user.id, other.id);
    db.save();
    hub.send(other.id, 'friends', { reason: 'cancelled', userId: user.id });
    return { ok: true };
  });

  route('DELETE', '/api/friends/:id', (req, params) => {
    const { user } = requireUser(req);
    const other = otherUser(params.id);
    db.removeFriendship(user.id, other.id);
    db.save();
    hub.send(other.id, 'friends', { reason: 'removed', userId: user.id });
    return { ok: true };
  });

  route('GET', '/api/notifications', (req) => {
    const { user } = requireUser(req);
    return { notifications: db.data.notifications[user.id] || [] };
  });

  route('POST', '/api/notifications/read', (req) => {
    const { user } = requireUser(req);
    for (const n of db.data.notifications[user.id] || []) n.read = true;
    db.save();
    return { ok: true };
  });

  route('DELETE', '/api/notifications', (req) => {
    const { user } = requireUser(req);
    db.data.notifications[user.id] = [];
    db.save();
    return { ok: true };
  });

  route('GET', '/api/conversations', (req) => {
    const { user } = requireUser(req);
    const reads = user.reads || {};
    const conversations = db
      .friendIds(user.id)
      .map((fid) => {
        const msgs = db.data.messages[db.conversationKey(user.id, fid)] || [];
        const last = msgs[msgs.length - 1] || null;
        const unread = msgs.filter((m) => m.from !== user.id && m.at > (reads[fid] || 0)).length;
        return { userId: fid, last, unread };
      })
      .filter((c) => c.last)
      .sort((a, b) => b.last.at - a.last.at);
    return { conversations };
  });

  route('GET', '/api/messages/:id', (req, params) => {
    const { user } = requireUser(req);
    const other = otherUser(params.id);
    if (!db.areFriends(user.id, other.id)) throw new HttpError(403, 'Nachrichten sind nur unter Freunden möglich.');
    const msgs = db.data.messages[db.conversationKey(user.id, other.id)] || [];
    return { messages: msgs.slice(-100) };
  });

  route('POST', '/api/messages/:id', async (req, params) => {
    const { user } = requireUser(req);
    const other = otherUser(params.id);
    if (!db.areFriends(user.id, other.id)) throw new HttpError(403, 'Nachrichten sind nur unter Freunden möglich.');
    const body = await readJson(req);
    const text = cleanText(body.text, 500);
    if (!text) throw new HttpError(400, 'Die Nachricht ist leer.');
    const key = db.conversationKey(user.id, other.id);
    const list = (db.data.messages[key] ||= []);
    const message = { id: newId(), from: user.id, to: other.id, text, at: Date.now() };
    list.push(message);
    if (list.length > 200) list.splice(0, list.length - 200);
    user.reads = { ...(user.reads || {}), [other.id]: message.at };
    db.save();
    hub.send(other.id, 'message', message);
    hub.send(user.id, 'message', message);
    unlock(user, 'first-message');
    return { message };
  });

  route('POST', '/api/messages/:id/read', (req, params) => {
    const { user } = requireUser(req);
    const other = otherUser(params.id);
    user.reads = { ...(user.reads || {}), [other.id]: Date.now() };
    db.save();
    return { ok: true };
  });

  route('GET', '/api/events', (req, params, url, res) => {
    const { user } = requireUser(req);
    hub.connect(user.id, res);
    return undefined;
  });

  // ---------- Statische Dateien ----------
  function serveStatic(req, res, pathname) {
    let rel = decodeURIComponent(pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.resolve(PUBLIC_DIR, '.' + rel);
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return false;
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      return false;
    }
    if (!stat.isFile()) return false;
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const headers = {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': /\.(woff2)$/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache',
      ETag: etag,
    };
    if (file.endsWith('.html')) headers['Content-Security-Policy'] = APP_CSP;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      res.end();
      return true;
    }
    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).pipe(res);
    return true;
  }

  async function handler(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;

    if (req.url.startsWith('/web/')) {
      return proxy.handle(req, res, req.url.slice('/web/'.length));
    }
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    if (pathname.startsWith('/api/')) {
      if (!apiLimiter.take(clientIp(req))) return sendJson(res, 429, { error: 'Zu viele Anfragen.' });
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = pathname.match(r.re);
        if (!m) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        try {
          const result = await r.handler(req, params, url, res);
          if (result === undefined) return;
          if (result && result.status && result.body) return sendJson(res, result.status, result.body);
          return sendJson(res, 200, result);
        } catch (err) {
          if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
          console.error(err);
          return sendJson(res, 500, { error: 'Interner Serverfehler.' });
        }
      }
      return sendJson(res, 404, { error: 'Nicht gefunden.' });
    }

    if ((req.method === 'GET' || req.method === 'HEAD') && serveStatic(req, res, pathname)) return;

    const fallback = proxy.fallbackFor(req);
    if (fallback) {
      res.writeHead(307, { Location: fallback });
      return res.end();
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 – Nicht gefunden');
  }

  const server = http.createServer((req, res) => {
    handler(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  server.on('close', () => {
    hub.close();
    db.flush();
  });

  return { server, db, hub };
}
