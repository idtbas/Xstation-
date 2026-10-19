// Web-Proxy für den eingebauten X-Station-Browser.
//
// Sicherheit:
//  * Nur angemeldete Nutzer erhalten einen signierten Proxy-Schlüssel.
//  * Ziele im lokalen/privaten Netz werden blockiert (SSRF-Schutz), auch nach DNS-Auflösung.
//  * Jede ausgelieferte Seite bekommt "Content-Security-Policy: sandbox" und läuft damit
//    in einem undurchsichtigen Ursprung: Sie kann weder Cookies noch Speicher der App lesen.

import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { rewriteHtml, rewriteCss, toProxied } from './rewrite.js';
import { RateLimiter } from './auth.js';

const MAX_REWRITE_BYTES = 10 * 1024 * 1024;
const MAX_BODY_BYTES = 100 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 25000;
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const SANDBOX_CSP = 'sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads';

const blocked = new net.BlockList();
for (const [addr, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]) {
  blocked.addSubnet(addr, prefix, 'ipv4');
}
for (const [addr, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['64:ff9b::', 96],
  ['2001:db8::', 32],
]) {
  blocked.addSubnet(addr, prefix, 'ipv6');
}

export function isBlockedAddress(address) {
  const family = net.isIP(address);
  if (!family) return true;
  if (family === 6) {
    const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) return blocked.check(mapped[1], 'ipv4');
    return blocked.check(address, 'ipv6');
  }
  return blocked.check(address, 'ipv4');
}

function makeLookup(allowPrivate) {
  return function safeLookup(hostname, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    dns.lookup(hostname, { all: true, family: options.family || 0 }, (err, addresses) => {
      if (err) return callback(err);
      if (!allowPrivate && addresses.some((a) => isBlockedAddress(a.address))) {
        const e = new Error('Ziel liegt in einem privaten Netzwerk');
        e.code = 'XS_BLOCKED';
        return callback(e);
      }
      if (options.all) return callback(null, addresses);
      return callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

// ---------- Cookie-Speicher pro Proxy-Schlüssel (nur im Arbeitsspeicher) ----------
class CookieJar {
  constructor() {
    this.cookies = [];
  }

  store(setCookies, url) {
    for (const line of setCookies) {
      const [pair, ...attrParts] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq < 1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const cookie = { name, value, domain: url.hostname.toLowerCase(), hostOnly: true, path: '/', expires: null };
      for (const part of attrParts) {
        const [k, ...v] = part.split('=');
        const key = k.trim().toLowerCase();
        const val = v.join('=').trim();
        if (key === 'domain' && val) {
          const d = val.replace(/^\./, '').toLowerCase();
          if (cookie.domain === d || cookie.domain.endsWith('.' + d)) {
            cookie.domain = d;
            cookie.hostOnly = false;
          }
        } else if (key === 'path' && val.startsWith('/')) cookie.path = val;
        else if (key === 'max-age') cookie.expires = Date.now() + Number(val) * 1000;
        else if (key === 'expires' && !cookie.expires) {
          const t = Date.parse(val);
          if (!Number.isNaN(t)) cookie.expires = t;
        }
      }
      this.cookies = this.cookies.filter(
        (c) => !(c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path),
      );
      if (cookie.expires === null || cookie.expires > Date.now()) this.cookies.push(cookie);
    }
    if (this.cookies.length > 400) this.cookies.splice(0, this.cookies.length - 400);
  }

  header(url) {
    const host = url.hostname.toLowerCase();
    const now = Date.now();
    this.cookies = this.cookies.filter((c) => c.expires === null || c.expires > now);
    return this.cookies
      .filter((c) => (c.hostOnly ? host === c.domain : host === c.domain || host.endsWith('.' + c.domain)))
      .filter((c) => url.pathname.startsWith(c.path))
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
  }
}

function decompress(res) {
  const enc = String(res.headers['content-encoding'] || '').toLowerCase();
  if (enc === 'gzip' || enc === 'x-gzip') return res.pipe(zlib.createGunzip());
  if (enc === 'deflate') return res.pipe(zlib.createInflate());
  if (enc === 'br') return res.pipe(zlib.createBrotliDecompress());
  return res;
}

async function readAll(stream, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Antwort zu groß'), { code: 'XS_TOO_LARGE' });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function detectCharset(contentType, buf) {
  const fromHeader = /charset=([\w-]+)/i.exec(contentType || '')?.[1];
  if (fromHeader) return fromHeader;
  const head = buf.subarray(0, 4096).toString('latin1');
  return /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1] || 'utf-8';
}

function decodeText(buf, charset) {
  try {
    return new TextDecoder(charset.toLowerCase()).decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function errorPage(title, detail, url) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  html,body{margin:0;height:100%;background:#0b0e14;color:#e8ecf3;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}
  .wrap{height:100%;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
  .card{max-width:560px;text-align:center}
  .icon{width:72px;height:72px;margin:0 auto 20px;border-radius:50%;display:grid;place-items:center;
    background:linear-gradient(135deg,#1f6bff33,#1fbf3a33);border:1px solid #ffffff22;font-size:34px}
  h1{font-weight:300;font-size:28px;margin:0 0 12px}
  p{color:#aab3c2;line-height:1.5;margin:0 0 8px}
  code{display:inline-block;margin-top:14px;padding:6px 10px;border-radius:8px;background:#ffffff0d;color:#c9d3e3;word-break:break-all}
</style></head><body><div class="wrap"><div class="card"><div class="icon">!</div>
<h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p>${url ? `<code>${escapeHtml(url)}</code>` : ''}
</div></div></body></html>`;
}

export function normalizeTarget(raw) {
  let target = raw.replace(/^(https?):\/(?!\/)/i, '$1://');
  if (!/^https?:\/\//i.test(target)) target = 'https://' + target;
  // Domain ohne abschließenden Schrägstrich → relative Links würden falsch aufgelöst.
  const needsSlash = /^https?:\/\/[^/?#]+(?:[?#]|$)/i.test(target);
  const url = new URL(target);
  return { url, redirect: needsSlash };
}

export function createWebProxy({ secret, allowPrivate = false, userExists = () => true }) {
  const lookup = makeLookup(allowPrivate);
  const jars = new Map();
  const limiter = new RateLimiter({ limit: 900, windowMs: 60_000 });

  function sign(userId) {
    return crypto.createHmac('sha256', secret).update('web:' + userId).digest('base64url').slice(0, 22);
  }

  function keyFor(userId) {
    return `${userId}.${sign(userId)}`;
  }

  function verifyKey(key) {
    const dot = key.lastIndexOf('.');
    if (dot < 1) return null;
    const userId = key.slice(0, dot);
    const sig = key.slice(dot + 1);
    const expected = sign(userId);
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return userExists(userId) ? userId : null;
  }

  function jarFor(key) {
    if (!jars.has(key)) {
      if (jars.size > 2000) jars.delete(jars.keys().next().value);
      jars.set(key, new CookieJar());
    }
    return jars.get(key);
  }

  function sendError(res, status, title, detail, url) {
    if (res.headersSent) return res.end();
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': SANDBOX_CSP,
      'Cache-Control': 'no-store',
    });
    res.end(errorPage(title, detail, url));
  }

  function realReferer(req, key) {
    const ref = req.headers.referer;
    if (!ref) return null;
    const marker = `/web/${key}/`;
    const idx = ref.indexOf(marker);
    if (idx < 0) return null;
    return ref.slice(idx + marker.length);
  }

  // rest = alles nach "/web/" (Schlüssel + Ziel-URL inkl. Query)
  async function handle(req, res, rest) {
    const slash = rest.indexOf('/');
    const key = slash > 0 ? rest.slice(0, slash) : rest;
    const rawTarget = slash > 0 ? rest.slice(slash + 1) : '';

    if (!verifyKey(key)) {
      return sendError(res, 403, 'Zugriff verweigert', 'Der Browser-Schlüssel ist ungültig. Bitte melde dich erneut an.');
    }
    if (!limiter.take(key)) {
      return sendError(res, 429, 'Zu viele Anfragen', 'Bitte warte einen Moment und versuche es erneut.');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || '*',
        'Access-Control-Max-Age': '600',
      });
      return res.end();
    }
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return sendError(res, 405, 'Methode nicht erlaubt', `Die Methode ${req.method} wird nicht unterstützt.`);
    }

    let target;
    try {
      const norm = normalizeTarget(rawTarget);
      target = norm.url;
      if (norm.redirect) {
        res.writeHead(302, { Location: `/web/${key}/${target.href}` });
        return res.end();
      }
    } catch {
      return sendError(res, 400, 'Ungültige Adresse', 'Diese Adresse konnte nicht verstanden werden.', rawTarget);
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return sendError(res, 400, 'Nicht unterstützt', 'Nur http- und https-Adressen können geöffnet werden.', target.href);
    }
    if (!ALLOWED_PORTS.has(target.port)) {
      return sendError(res, 403, 'Port gesperrt', 'Aus Sicherheitsgründen sind nur Standard-Ports erlaubt.', target.href);
    }
    const host = target.hostname.replace(/^\[|\]$/g, '');
    if (!allowPrivate && (host === 'localhost' || host.endsWith('.localhost') || (net.isIP(host) && isBlockedAddress(host)))) {
      return sendError(res, 403, 'Adresse gesperrt', 'Adressen im lokalen Netzwerk können aus Sicherheitsgründen nicht geöffnet werden.', target.href);
    }

    const jar = jarFor(key);
    const headers = {
      'User-Agent': USER_AGENT,
      Accept: req.headers.accept || '*/*',
      'Accept-Language': req.headers['accept-language'] || 'de-DE,de;q=0.9,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
    };
    for (const h of ['content-type', 'range', 'if-none-match', 'if-modified-since', 'x-requested-with']) {
      if (req.headers[h]) headers[h] = req.headers[h];
    }
    const cookie = jar.header(target);
    if (cookie) headers.Cookie = cookie;
    const ref = realReferer(req, key);
    if (ref) {
      headers.Referer = ref;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        try {
          headers.Origin = new URL(ref).origin;
        } catch {
          /* ignorieren */
        }
      }
    }

    let body = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      try {
        body = await readAll(req, MAX_UPLOAD_BYTES);
        headers['Content-Length'] = String(body.length);
      } catch {
        return sendError(res, 413, 'Zu groß', 'Die gesendeten Daten sind zu groß.');
      }
    }

    const lib = target.protocol === 'https:' ? https : http;
    const upstreamReq = lib.request(target, { method: req.method, headers, lookup, timeout: TIMEOUT_MS });

    upstreamReq.on('timeout', () => upstreamReq.destroy(Object.assign(new Error('timeout'), { code: 'XS_TIMEOUT' })));
    upstreamReq.on('error', (err) => {
      const map = {
        XS_BLOCKED: ['Adresse gesperrt', 'Adressen im lokalen Netzwerk können aus Sicherheitsgründen nicht geöffnet werden.', 403],
        XS_TIMEOUT: ['Zeitüberschreitung', 'Die Webseite hat nicht rechtzeitig geantwortet.', 504],
        ENOTFOUND: ['Seite nicht gefunden', 'Die Adresse konnte nicht aufgelöst werden. Ist sie richtig geschrieben?', 502],
        ECONNREFUSED: ['Verbindung abgelehnt', 'Der Server hat die Verbindung abgelehnt.', 502],
      };
      const [title, detail, status] = map[err.code] || ['Seite nicht erreichbar', 'Die Webseite konnte nicht geladen werden.', 502];
      sendError(res, status, title, detail, target.href);
    });

    upstreamReq.on('response', async (up) => {
      try {
        const setCookie = up.headers['set-cookie'];
        if (setCookie) jar.store(setCookie, target);

        const outHeaders = {
          'Access-Control-Allow-Origin': '*',
          'Referrer-Policy': 'unsafe-url',
          'X-XStation-Url': encodeURI(target.href),
        };
        for (const h of ['content-type', 'cache-control', 'last-modified', 'etag', 'content-disposition', 'content-range', 'accept-ranges', 'expires']) {
          if (up.headers[h]) outHeaders[h] = up.headers[h];
        }

        // Weiterleitungen umschreiben
        if (up.statusCode >= 300 && up.statusCode < 400 && up.headers.location) {
          up.resume();
          outHeaders.Location = toProxied(up.headers.location, target.href, key);
          outHeaders['Cache-Control'] = 'no-store';
          res.writeHead(up.statusCode, outHeaders);
          return res.end();
        }

        const type = String(up.headers['content-type'] || '').toLowerCase();
        const isHtml = type.includes('text/html') || type.includes('application/xhtml');
        const isCss = type.includes('text/css');

        if (req.method === 'HEAD') {
          up.resume();
          res.writeHead(up.statusCode, outHeaders);
          return res.end();
        }

        if (isHtml || isCss) {
          const buf = await readAll(decompress(up), MAX_REWRITE_BYTES);
          const text = decodeText(buf, detectCharset(type, buf));
          let out;
          if (isHtml) {
            const cfg = JSON.stringify({ key, url: target.href }).replace(/</g, '\\u003c');
            out = rewriteHtml(text, {
              pageUrl: target.href,
              key,
              inject: `<script src="/xs-web-client.js" data-xs='${cfg.replace(/'/g, '&#39;')}'></script>`,
            });
            outHeaders['Content-Type'] = 'text/html; charset=utf-8';
            outHeaders['Content-Security-Policy'] = SANDBOX_CSP;
            outHeaders['Cache-Control'] = 'no-store';
          } else {
            out = rewriteCss(text, target.href, key);
            outHeaders['Content-Type'] = 'text/css; charset=utf-8';
          }
          const payload = Buffer.from(out, 'utf8');
          outHeaders['Content-Length'] = String(payload.length);
          res.writeHead(up.statusCode, outHeaders);
          return res.end(payload);
        }

        // Alles andere (Bilder, Skripte, Schriften …) unverändert durchreichen.
        if (type.includes('svg') || type.includes('xml')) outHeaders['Content-Security-Policy'] = SANDBOX_CSP;
        res.writeHead(up.statusCode, outHeaders);
        let sent = 0;
        const stream = decompress(up);
        stream.on('data', (chunk) => {
          sent += chunk.length;
          if (sent > MAX_BODY_BYTES) {
            stream.destroy();
            res.destroy();
          }
        });
        stream.on('error', () => res.destroy());
        stream.pipe(res);
      } catch (err) {
        if (err.code === 'XS_TOO_LARGE') sendError(res, 502, 'Seite zu groß', 'Diese Seite ist zu groß für den X-Station-Browser.', target.href);
        else sendError(res, 502, 'Fehler beim Laden', 'Die Antwort der Webseite konnte nicht verarbeitet werden.', target.href);
      }
    });

    req.on('close', () => {
      if (!res.writableEnded) upstreamReq.destroy();
    });
    upstreamReq.end(body || undefined);
  }

  // Fallback: Eine proxied Seite fordert eine root-relative URL ("/bild.png") an,
  // die nicht umgeschrieben wurde. Anhand des Referers leiten wir sie korrekt weiter.
  function fallbackFor(req) {
    const ref = req.headers.referer;
    if (!ref) return null;
    const m = ref.match(/\/web\/([^/]+)\/(https?:\/\/?[^/?#]+)/i);
    if (!m) return null;
    if (!verifyKey(m[1])) return null;
    const origin = m[2].replace(/^(https?):\/(?!\/)/i, '$1://');
    return `/web/${m[1]}/${origin}${req.url}`;
  }

  return { keyFor, verifyKey, handle, fallbackFor };
}
