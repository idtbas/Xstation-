// Kleiner JSON-Datenspeicher ohne externe Abhängigkeiten.
// Alle Daten liegen im Speicher und werden verzögert und atomar
// (temporäre Datei + rename) auf die Festplatte geschrieben.

import fs from 'node:fs';
import path from 'node:path';

const EMPTY = () => ({
  version: 1,
  users: {},
  sessions: {},
  friendships: [],
  requests: [],
  notifications: {},
  messages: {},
  meta: {},
});

export class Database {
  constructor(file) {
    this.file = file;
    this.data = EMPTY();
    this.timer = null;
    this.writing = false;
    this.pending = false;
  }

  load() {
    if (!this.file) return this;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (fs.existsSync(this.file)) {
      const raw = fs.readFileSync(this.file, 'utf8');
      this.data = { ...EMPTY(), ...JSON.parse(raw) };
    }
    return this;
  }

  save() {
    if (!this.file) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 150);
  }

  flush() {
    if (!this.file) return;
    clearTimeout(this.timer);
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }

  // ---------- Benutzer ----------
  userById(id) {
    return this.data.users[id] || null;
  }

  userByName(username) {
    const lower = String(username || '').toLowerCase();
    return Object.values(this.data.users).find((u) => u.usernameLower === lower) || null;
  }

  allUsers() {
    return Object.values(this.data.users);
  }

  // ---------- Freundschaften ----------
  static pair(a, b) {
    return a < b ? [a, b] : [b, a];
  }

  areFriends(a, b) {
    const [x, y] = Database.pair(a, b);
    return this.data.friendships.some((f) => f.a === x && f.b === y);
  }

  friendIds(userId) {
    const out = [];
    for (const f of this.data.friendships) {
      if (f.a === userId) out.push(f.b);
      else if (f.b === userId) out.push(f.a);
    }
    return out;
  }

  friendshipSince(a, b) {
    const [x, y] = Database.pair(a, b);
    return this.data.friendships.find((f) => f.a === x && f.b === y)?.since || null;
  }

  addFriendship(a, b) {
    if (this.areFriends(a, b)) return;
    const [x, y] = Database.pair(a, b);
    this.data.friendships.push({ a: x, b: y, since: Date.now() });
  }

  removeFriendship(a, b) {
    const [x, y] = Database.pair(a, b);
    this.data.friendships = this.data.friendships.filter((f) => !(f.a === x && f.b === y));
  }

  findRequest(from, to) {
    return this.data.requests.find((r) => r.from === from && r.to === to) || null;
  }

  removeRequest(from, to) {
    this.data.requests = this.data.requests.filter((r) => !(r.from === from && r.to === to));
  }

  // ---------- Nachrichten ----------
  conversationKey(a, b) {
    return Database.pair(a, b).join('|');
  }
}
