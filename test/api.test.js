import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './helpers.js';

describe('Konten', () => {
  let app;
  before(async () => (app = await startApp()));
  after(() => app.stop());

  test('Gesundheitsprüfung meldet Server-Modus', async () => {
    const { status, data } = await app.call('GET', '/api/health');
    assert.equal(status, 200);
    assert.equal(data.mode, 'server');
  });

  test('Registrierung verlangt akzeptierte Nutzungsbedingungen', async () => {
    const res = await app.call('POST', '/api/auth/register', { username: 'ohneagb', password: 'passwort123' });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /Nutzungsbedingungen/);
  });

  test('Registrierung prüft Benutzername und Passwort', async () => {
    let res = await app.call('POST', '/api/auth/register', { username: 'a', password: 'passwort123', acceptedTerms: '1.0' });
    assert.equal(res.status, 400);
    res = await app.call('POST', '/api/auth/register', { username: 'gueltig', password: 'kurz', acceptedTerms: '1.0' });
    assert.equal(res.status, 400);
  });

  test('Registrierung, Anmeldung und Profil', async () => {
    const reg = await app.register('Alice', { displayName: 'Alice A.', avatar: 'av3' });
    assert.ok(reg.token);
    assert.equal(reg.user.displayName, 'Alice A.');
    assert.equal(reg.user.avatar, 'av3');
    assert.ok(reg.user.achievements.welcome, 'Willkommens-Erfolg fehlt');
    assert.ok(!('passwordHash' in reg.user), 'Passwort-Hash darf nie zurückgegeben werden');

    const dup = await app.call('POST', '/api/auth/register', { username: 'alice', password: 'passwort123', acceptedTerms: '1.0' });
    assert.equal(dup.status, 409, 'Benutzernamen müssen unabhängig von Groß-/Kleinschreibung eindeutig sein');

    const bad = await app.call('POST', '/api/auth/login', { username: 'alice', password: 'falsch' });
    assert.equal(bad.status, 401);

    const login = await app.call('POST', '/api/auth/login', { username: 'ALICE', password: 'passwort123' });
    assert.equal(login.status, 200);

    const me = await app.call('PATCH', '/api/me', { bio: 'Hallo Welt', status: 'busy' }, login.data.token);
    assert.equal(me.data.bio, 'Hallo Welt');
    assert.equal(me.data.status, 'busy');

    const out = await app.call('POST', '/api/auth/logout', undefined, login.data.token);
    assert.equal(out.status, 200);
    const after = await app.call('GET', '/api/me', undefined, login.data.token);
    assert.equal(after.status, 401);
  });

  test('Passwort ändern und Konto löschen', async () => {
    const { token } = await app.register('carol');
    let res = await app.call('POST', '/api/me/password', { current: 'falsch', next: 'neuespasswort' }, token);
    assert.equal(res.status, 403);
    res = await app.call('POST', '/api/me/password', { current: 'passwort123', next: 'neuespasswort' }, token);
    assert.equal(res.status, 200);
    res = await app.call('DELETE', '/api/me', { password: 'neuespasswort' }, token);
    assert.equal(res.status, 200);
    res = await app.call('POST', '/api/auth/login', { username: 'carol', password: 'neuespasswort' });
    assert.equal(res.status, 401);
  });

  test('Fehlgeschlagene Anmeldungen werden begrenzt, erfolgreiche nicht', async () => {
    await app.register('dave');
    for (let i = 0; i < 12; i++) {
      const ok = await app.call('POST', '/api/auth/login', { username: 'dave', password: 'passwort123' });
      assert.equal(ok.status, 200);
    }
    let last;
    for (let i = 0; i < 11; i++) last = await app.call('POST', '/api/auth/login', { username: 'dave', password: 'falsch' });
    assert.equal(last.status, 429);
  });
});

describe('Freunde, Nachrichten und Erfolge', () => {
  let app;
  let a;
  let b;
  before(async () => {
    app = await startApp();
    a = await app.register('anna');
    b = await app.register('ben');
  });
  after(() => app.stop());

  test('Suche findet andere Nutzer mit Beziehung', async () => {
    const res = await app.call('GET', '/api/users/search?q=be', undefined, a.token);
    assert.equal(res.data.users.length, 1);
    assert.equal(res.data.users[0].username, 'ben');
    assert.equal(res.data.users[0].relation, 'none');
  });

  test('Anfrage, Annehmen und Freundesliste', async () => {
    let res = await app.call('POST', '/api/friends/request', { username: 'ben' }, a.token);
    assert.equal(res.data.status, 'requested');
    res = await app.call('POST', '/api/friends/request', { username: 'ben' }, a.token);
    assert.equal(res.status, 409);

    const bFriends = await app.call('GET', '/api/friends', undefined, b.token);
    assert.equal(bFriends.data.incoming.length, 1);
    const notes = await app.call('GET', '/api/notifications', undefined, b.token);
    assert.equal(notes.data.notifications[0].type, 'friend-request');

    res = await app.call('POST', `/api/friends/${a.user.id}/accept`, undefined, b.token);
    assert.equal(res.status, 200);
    const aFriends = await app.call('GET', '/api/friends', undefined, a.token);
    assert.equal(aFriends.data.friends.length, 1);
    assert.equal(aFriends.data.friends[0].username, 'ben');
    assert.equal(aFriends.data.friends[0].online, false);

    const me = await app.call('GET', '/api/me', undefined, a.token);
    assert.ok(me.data.achievements['first-friend']);
  });

  test('Gegenseitige Anfrage macht direkt zu Freunden', async () => {
    const c = await app.register('clara');
    await app.call('POST', '/api/friends/request', { username: 'anna' }, c.token);
    const res = await app.call('POST', '/api/friends/request', { username: 'clara' }, a.token);
    assert.equal(res.data.status, 'friends');
  });

  test('Nachrichten nur unter Freunden', async () => {
    const stranger = await app.register('fremd');
    let res = await app.call('POST', `/api/messages/${a.user.id}`, { text: 'Hi' }, stranger.token);
    assert.equal(res.status, 403);

    res = await app.call('POST', `/api/messages/${b.user.id}`, { text: '  Hallo Ben!  ' }, a.token);
    assert.equal(res.status, 200);
    assert.equal(res.data.message.text, 'Hallo Ben!');

    const conv = await app.call('GET', '/api/conversations', undefined, b.token);
    assert.equal(conv.data.conversations[0].unread, 1);
    await app.call('POST', `/api/messages/${a.user.id}/read`, undefined, b.token);
    const conv2 = await app.call('GET', '/api/conversations', undefined, b.token);
    assert.equal(conv2.data.conversations[0].unread, 0);

    const msgs = await app.call('GET', `/api/messages/${a.user.id}`, undefined, b.token);
    assert.equal(msgs.data.messages.length, 1);
  });

  test('Erfolge: nur bekannte, einmalig', async () => {
    let res = await app.call('POST', '/api/achievements/gibt-es-nicht', undefined, a.token);
    assert.equal(res.status, 404);
    res = await app.call('POST', '/api/achievements/surfer', undefined, a.token);
    assert.deepEqual(res.data.unlocked, ['surfer']);
    res = await app.call('POST', '/api/achievements/surfer', undefined, a.token);
    assert.deepEqual(res.data.unlocked, []);
  });

  test('Live-Ereignisse: Online-Status und Anfrage kommen an', async () => {
    const ctrl = new AbortController();
    const events = [];
    const res = await fetch(`${app.base}/api/events`, { headers: { Authorization: `Bearer ${a.token}` }, signal: ctrl.signal });
    assert.equal(res.status, 200);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const pump = (async () => {
      let buf = '';
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value);
          for (const m of buf.matchAll(/event: (\w+)\ndata: (.*)\n\n/g)) events.push([m[1], JSON.parse(m[2])]);
          buf = buf.slice(buf.lastIndexOf('\n\n') + 2);
        }
      } catch {
        /* abgebrochen */
      }
    })();

    const d = await app.register('dora');
    await app.call('POST', '/api/friends/request', { username: 'anna' }, d.token);
    await app.call('POST', `/api/messages/${a.user.id}`, { text: 'Live!' }, b.token);
    await new Promise((r) => setTimeout(r, 200));
    ctrl.abort();
    await pump;
    const types = events.map((e) => e[0]);
    assert.ok(types.includes('notification'), 'Benachrichtigung fehlt');
    assert.ok(types.includes('message'), 'Nachricht fehlt');
  });

  test('Ohne Anmeldung kein Zugriff', async () => {
    const res = await app.call('GET', '/api/friends');
    assert.equal(res.status, 401);
  });

  test('Daten werden dauerhaft gespeichert', async () => {
    app.db.flush();
    const { Database } = await import('../server/lib/db.js');
    const db = new Database(`${app.dataDir}/db.json`).load();
    assert.ok(db.userByName('anna'));
    assert.ok(db.areFriends(a.user.id, b.user.id));
  });
});

describe('Statische Dateien', () => {
  let app;
  before(async () => (app = await startApp()));
  after(() => app.stop());

  test('Startseite mit Sicherheits-Headern', async () => {
    const res = await fetch(`${app.base}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(await res.text(), /X-Station/);
  });

  test('Pfad-Traversal wird verhindert', async () => {
    const res = await fetch(`${app.base}/..%2f..%2fpackage.json`);
    assert.notEqual(res.status, 200);
  });
});
