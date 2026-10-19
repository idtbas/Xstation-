import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startApp } from './helpers.js';
import { rewriteHtml, rewriteCss, rewriteSrcset, toProxied } from '../server/lib/rewrite.js';
import { isBlockedAddress, normalizeTarget } from '../server/lib/proxy.js';

describe('URL-Umschreibung', () => {
  const key = 'k';
  const page = 'https://example.com/dir/page.html';

  test('toProxied löst relative URLs auf und lässt Sonderfälle in Ruhe', () => {
    assert.equal(toProxied('/a.png', page, key), '/web/k/https://example.com/a.png');
    assert.equal(toProxied('b.png', page, key), '/web/k/https://example.com/dir/b.png');
    assert.equal(toProxied('//cdn.example.org/x.js', page, key), '/web/k/https://cdn.example.org/x.js');
    assert.equal(toProxied('#top', page, key), '#top');
    assert.equal(toProxied('javascript:void(0)', page, key), 'javascript:void(0)');
    assert.equal(toProxied('data:image/png;base64,AA', page, key), 'data:image/png;base64,AA');
    assert.equal(toProxied('mailto:a@b.de', page, key), 'mailto:a@b.de');
  });

  test('HTML: Attribute, Formulare, Meta-CSP und Injektion', () => {
    const html = `<!doctype html><html><head>
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'">
      <meta charset="iso-8859-1">
      <link rel="stylesheet" href="/s.css" integrity="sha-abc">
      <link rel="manifest" href="/m.json">
      </head><body>
      <a href="/x?a=1&amp;b=2" target="_top">x</a>
      <img src="i.png" srcset="i1.png 1x, /i2.png 2x">
      <form action="/search"><input name="q"></form>
      <div style="background:url('/bg.png')"></div>
      <script>var s = "<a href='/nicht-anfassen'>";</script>
      </body></html>`;
    const out = rewriteHtml(html, { pageUrl: page, key, inject: '<script src="/xs-web-client.js"></script>' });
    assert.ok(!/Content-Security-Policy/i.test(out), 'Meta-CSP muss entfernt werden');
    assert.ok(!/iso-8859-1/.test(out), 'Alter Zeichensatz muss entfernt werden');
    assert.ok(!/integrity=/.test(out), 'integrity muss entfernt werden');
    assert.ok(!/rel="manifest"/.test(out));
    assert.match(out, /href="\/web\/k\/https:\/\/example\.com\/s\.css"/);
    assert.match(out, /href="\/web\/k\/https:\/\/example\.com\/x\?a=1&amp;b=2"/);
    assert.match(out, /target="_self"/);
    assert.match(out, /src="\/web\/k\/https:\/\/example\.com\/dir\/i\.png"/);
    assert.match(out, /srcset="\/web\/k\/https:\/\/example\.com\/dir\/i1\.png 1x, \/web\/k\/https:\/\/example\.com\/i2\.png 2x"/);
    assert.match(out, /action="\/web\/k\/https:\/\/example\.com\/search"/);
    assert.match(out, /url\('\/web\/k\/https:\/\/example\.com\/bg\.png'\)/);
    assert.match(out, /href='\/nicht-anfassen'/, 'Skriptinhalt darf nicht verändert werden');
    assert.match(out, /<head><meta charset="utf-8"><script src="\/xs-web-client\.js"><\/script>/);
    assert.ok(out.startsWith('<!doctype html>'));
  });

  test('HTML: vorhandene <base href> wird berücksichtigt', () => {
    const out = rewriteHtml('<head><base href="https://cdn.example.net/app/"></head><img src="a.png">', { pageUrl: page, key });
    assert.match(out, /src="\/web\/k\/https:\/\/cdn\.example\.net\/app\/a\.png"/);
    assert.match(out, /<base href="\/web\/k\/https:\/\/cdn\.example\.net\/app\/">/);
  });

  test('CSS und srcset', () => {
    assert.equal(rewriteCss('a{background:url(x.png)}', page, key), 'a{background:url(/web/k/https://example.com/dir/x.png)}');
    assert.equal(rewriteCss('@import "/b.css";', page, key), '@import "/web/k/https://example.com/b.css";');
    assert.equal(rewriteSrcset('a.png 1x,b.png 2x', page, key), '/web/k/https://example.com/dir/a.png 1x, /web/k/https://example.com/dir/b.png 2x');
  });

  test('Ziel-Normalisierung', () => {
    assert.equal(normalizeTarget('example.com/a').url.href, 'https://example.com/a');
    assert.equal(normalizeTarget('https:/example.com/a').url.href, 'https://example.com/a');
    assert.equal(normalizeTarget('https://example.com').redirect, true);
    assert.equal(normalizeTarget('https://example.com/').redirect, false);
  });
});

describe('SSRF-Schutz', () => {
  test('Private und lokale Adressen sind gesperrt', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.10', '172.16.5.4', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '100.64.0.1']) {
      assert.equal(isBlockedAddress(ip), true, ip);
    }
    for (const ip of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111']) {
      assert.equal(isBlockedAddress(ip), false, ip);
    }
  });
});

describe('Web-Proxy', () => {
  let site;
  let siteBase;

  before(async () => {
    site = http.createServer((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'", 'Set-Cookie': 'sid=42; Path=/' });
        return res.end('<html><head><title>T</title></head><body><a href="/next">weiter</a><img src="/i.png"></body></html>');
      }
      if (req.url === '/redir') {
        res.writeHead(302, { Location: '/ziel' });
        return res.end();
      }
      if (req.url === '/cookie') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end(req.headers.cookie || 'keins');
      }
      res.writeHead(200, { 'Content-Type': 'text/css' });
      res.end('body{background:url(/bg.png)}');
    });
    await new Promise((r) => site.listen(0, '127.0.0.1', r));
    siteBase = `http://127.0.0.1:${site.address().port}`;
  });
  after(() => new Promise((r) => site.close(r)));

  test('Ungültiger Schlüssel wird abgewiesen', async () => {
    const app = await startApp();
    try {
      const res = await fetch(`${app.base}/web/falsch.schluessel/https://example.com/`);
      assert.equal(res.status, 403);
      assert.match(res.headers.get('content-security-policy'), /sandbox/);
    } finally {
      await app.stop();
    }
  });

  test('Lokale Ziele sind im Normalbetrieb gesperrt', async () => {
    const app = await startApp();
    try {
      const { user } = await app.register('proxyuser');
      for (const target of ['http://127.0.0.1/', 'http://localhost/', 'http://[::1]/', 'http://169.254.169.254/latest/']) {
        const res = await fetch(`${app.base}/web/${user.proxyKey}/${target}`, { redirect: 'manual' });
        assert.equal(res.status, 403, target);
      }
    } finally {
      await app.stop();
    }
  });

  test('Seite wird umgeschrieben, isoliert und Header bereinigt', async () => {
    const app = await startApp({ allowPrivateProxy: true });
    try {
      const { user } = await app.register('surfer');
      const key = user.proxyKey;
      const res = await fetch(`${app.base}/web/${key}/${siteBase}/`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-frame-options'), null, 'X-Frame-Options muss entfernt werden');
      assert.match(res.headers.get('content-security-policy'), /^sandbox /, 'Seite muss in einer Sandbox laufen');
      assert.ok(!/allow-same-origin/.test(res.headers.get('content-security-policy')));
      assert.equal(res.headers.get('set-cookie'), null, 'Cookies dürfen nicht an die App durchgereicht werden');
      const body = await res.text();
      assert.match(body, new RegExp(`href="/web/${key.replace('.', '\\.')}/${siteBase}/next"`));
      assert.match(body, /xs-web-client\.js/);

      const css = await (await fetch(`${app.base}/web/${key}/${siteBase}/s.css`)).text();
      assert.match(css, new RegExp(`url\\(/web/${key.replace('.', '\\.')}/${siteBase}/bg\\.png\\)`));

      const redir = await fetch(`${app.base}/web/${key}/${siteBase}/redir`, { redirect: 'manual' });
      assert.equal(redir.status, 302);
      assert.equal(redir.headers.get('location'), `/web/${key}/${siteBase}/ziel`);

      const cookie = await (await fetch(`${app.base}/web/${key}/${siteBase}/cookie`)).text();
      assert.equal(cookie, 'sid=42', 'Cookie-Speicher pro Nutzer funktioniert');

      const noSlash = await fetch(`${app.base}/web/${key}/${siteBase}`, { redirect: 'manual' });
      assert.equal(noSlash.status, 302);
      assert.equal(noSlash.headers.get('location'), `/web/${key}/${siteBase}/`);
    } finally {
      await app.stop();
    }
  });

  test('Root-relative Fehlgriffe werden per Referer zurück in den Proxy geleitet', async () => {
    const app = await startApp({ allowPrivateProxy: true });
    try {
      const { user } = await app.register('referer');
      const res = await fetch(`${app.base}/irgendwas.png`, {
        headers: { Referer: `${app.base}/web/${user.proxyKey}/${siteBase}/seite` },
        redirect: 'manual',
      });
      assert.equal(res.status, 307);
      assert.equal(res.headers.get('location'), `/web/${user.proxyKey}/${siteBase}/irgendwas.png`);
    } finally {
      await app.stop();
    }
  });
});
