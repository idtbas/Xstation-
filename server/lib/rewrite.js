// URL-Umschreibung für den eingebauten Browser.
// Alle Links, Bilder, Skripte usw. einer Seite werden so umgeschrieben,
// dass sie wieder über den X-Station-Proxy (/web/<schlüssel>/<url>) laufen.

const SKIP_SCHEMES = /^(?:data|javascript|mailto|tel|blob|about|sms|intent|chrome|file):/i;

export function proxyPrefix(key) {
  return `/web/${key}/`;
}

export function toProxied(raw, baseUrl, key) {
  if (raw == null) return raw;
  const value = String(raw).trim();
  if (!value || value.startsWith('#') || SKIP_SCHEMES.test(value)) return raw;
  if (value.startsWith(proxyPrefix(key))) return raw;
  let abs;
  try {
    abs = new URL(value, baseUrl);
  } catch {
    return raw;
  }
  if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return raw;
  return proxyPrefix(key) + abs.href;
}

const ENTITY_MAP = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' };

export function decodeEntities(str) {
  return str.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITY_MAP[code.toLowerCase()] ?? m;
  });
}

function encodeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function rewriteSrcset(value, baseUrl, key) {
  return value
    .split(/,(?=\s*\S)/)
    .map((part) => {
      const m = part.trim().match(/^(\S+)(\s+.*)?$/);
      if (!m) return part;
      return toProxied(m[1], baseUrl, key) + (m[2] || '');
    })
    .join(', ');
}

export function rewriteCss(css, baseUrl, key) {
  return css
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (m, q, url) => `url(${q}${toProxied(url, baseUrl, key)}${q})`)
    .replace(/@import\s+(["'])([^"']+)\1/gi, (m, q, url) => `@import ${q}${toProxied(url, baseUrl, key)}${q}`);
}

const URL_ATTRS = new Set([
  'href',
  'src',
  'action',
  'formaction',
  'poster',
  'background',
  'data',
  'xlink:href',
  'data-src',
  'data-href',
  'data-original',
  'data-lazy-src',
  'data-url',
]);
const SRCSET_ATTRS = new Set(['srcset', 'imagesrcset', 'data-srcset']);
const ATTR_RE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttrs(str) {
  const attrs = [];
  if (!str) return attrs;
  let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(str))) {
    const value = m[2] ?? m[3] ?? m[4];
    attrs.push({ name: m[1], value: value === undefined ? null : decodeEntities(value) });
  }
  return attrs;
}

function buildTag(tag, attrs, selfClose) {
  const parts = attrs.map((a) => (a.value === null ? a.name : `${a.name}="${encodeAttr(a.value)}"`));
  return `<${tag}${parts.length ? ' ' + parts.join(' ') : ''}${selfClose ? ' /' : ''}>`;
}

function rewriteAttrs(tag, attrs, ctx) {
  const lower = tag.toLowerCase();
  const out = [];
  for (const attr of attrs) {
    const name = attr.name.toLowerCase();
    if (attr.value === null) {
      out.push(attr);
      continue;
    }
    if (name === 'integrity' || name === 'nonce') continue;
    if (name.startsWith('on')) {
      out.push(attr);
      continue;
    }
    if (URL_ATTRS.has(name)) {
      out.push({ name: attr.name, value: toProxied(attr.value, ctx.base, ctx.key) });
    } else if (SRCSET_ATTRS.has(name)) {
      out.push({ name: attr.name, value: rewriteSrcset(attr.value, ctx.base, ctx.key) });
    } else if (name === 'style') {
      out.push({ name: attr.name, value: rewriteCss(attr.value, ctx.base, ctx.key) });
    } else if (name === 'target' && lower !== 'form' && /^_(top|parent)$/i.test(attr.value)) {
      out.push({ name: attr.name, value: '_self' });
    } else {
      out.push(attr);
    }
  }
  return out;
}

const TOKEN_RE =
  /<!--[\s\S]*?-->|<(script|style)\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/\1\s*>|<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

// Ermittelt eine evtl. vorhandene <base href> der Originalseite.
export function findBaseHref(html, pageUrl) {
  const m = html.match(/<base\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  if (!m) return null;
  try {
    return new URL(decodeEntities(m[1] ?? m[2] ?? m[3]), pageUrl).href;
  } catch {
    return null;
  }
}

export function rewriteHtml(html, { pageUrl, key, inject = '' }) {
  const originalBase = findBaseHref(html, pageUrl);
  const ctx = { base: originalBase || pageUrl, key };
  let injected = false;
  const headInject =
    '<meta charset="utf-8">' +
    (originalBase ? `<base href="${encodeAttr(toProxied(originalBase, pageUrl, key))}">` : '') +
    inject;

  let out = html.replace(TOKEN_RE, (match, blockTag, blockAttrs, blockBody, tag, attrStr) => {
    if (match.startsWith('<!--')) return match;

    if (blockTag) {
      const attrs = rewriteAttrs(blockTag, parseAttrs(blockAttrs), ctx);
      const lower = blockTag.toLowerCase();
      let body = blockBody;
      if (lower === 'style') body = rewriteCss(blockBody, ctx.base, ctx.key);
      return buildTag(blockTag, attrs, false) + body + `</${blockTag}>`;
    }

    const lower = tag.toLowerCase();
    const selfClose = /\/\s*$/.test(attrStr || '');
    const attrs = parseAttrs((attrStr || '').replace(/\/\s*$/, ''));

    if (lower === 'base') return '';
    if (lower === 'meta') {
      const httpEquiv = attrs.find((a) => a.name.toLowerCase() === 'http-equiv')?.value?.toLowerCase();
      if (attrs.some((a) => a.name.toLowerCase() === 'charset')) return '';
      if (httpEquiv === 'content-security-policy' || httpEquiv === 'x-frame-options' || httpEquiv === 'content-type') {
        return '';
      }
      if (httpEquiv === 'refresh') {
        const content = attrs.find((a) => a.name.toLowerCase() === 'content');
        if (content?.value) {
          content.value = content.value.replace(/(url\s*=\s*['"]?)([^'";]+)/i, (m, p, url) => p + toProxied(url, ctx.base, ctx.key));
        }
        return buildTag(tag, attrs, selfClose);
      }
    }
    if (lower === 'link') {
      const rel = (attrs.find((a) => a.name.toLowerCase() === 'rel')?.value || '').toLowerCase();
      if (/\b(manifest|serviceworker)\b/.test(rel)) return '';
    }

    const rebuilt = buildTag(tag, rewriteAttrs(tag, attrs, ctx), selfClose);
    if (lower === 'head' && !injected) {
      injected = true;
      return rebuilt + headInject;
    }
    return rebuilt;
  });

  if (!injected) {
    const htmlTag = out.match(/<html\b[^>]*>/i);
    if (htmlTag) {
      const idx = htmlTag.index + htmlTag[0].length;
      out = out.slice(0, idx) + headInject + out.slice(idx);
    } else {
      const doctype = out.match(/^\s*<!doctype[^>]*>/i);
      const idx = doctype ? doctype[0].length : 0;
      out = out.slice(0, idx) + headInject + out.slice(idx);
    }
  }
  return out;
}
