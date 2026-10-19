// Passwort-Hashing (scrypt), Sitzungs-Tokens und Eingabeprüfung.

import crypto from 'node:crypto';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scrypt(password, salt, opts) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, opts.keylen, { N: opts.N, r: opts.r, p: opts.p }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const [algo, N, r, p, saltB64, keyB64] = String(stored || '').split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    keylen: expected.length,
  });
  return crypto.timingSafeEqual(key, expected);
}

export function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('base64url');
}

export function newId() {
  return crypto.randomUUID();
}

// ---------- Validierung ----------
export const USERNAME_RE = /^[A-Za-z0-9_.-]{3,16}$/;
export const AVATARS = Array.from({ length: 16 }, (_, i) => `av${i + 1}`);
export const STATUSES = ['online', 'busy', 'away', 'invisible'];

export function validateUsername(name) {
  if (typeof name !== 'string' || !USERNAME_RE.test(name)) {
    return 'Der Benutzername muss 3–16 Zeichen lang sein und darf nur Buchstaben, Zahlen, „_“, „.“ und „-“ enthalten.';
  }
  return null;
}

export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 200) {
    return 'Das Passwort muss mindestens 8 Zeichen lang sein.';
  }
  return null;
}

export function cleanText(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// Einfache Begrenzung von Versuchen pro Schlüssel (z. B. IP + Benutzername).
export class RateLimiter {
  constructor({ limit, windowMs }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  take(key) {
    const now = Date.now();
    let entry = this.hits.get(key);
    if (!entry || now - entry.start > this.windowMs) {
      entry = { start: now, count: 0 };
      this.hits.set(key, entry);
    }
    entry.count += 1;
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) if (now - v.start > this.windowMs) this.hits.delete(k);
    }
    return entry.count <= this.limit;
  }
}
