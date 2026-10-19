// Wird in jede Seite injiziert, die über den X-Station-Browser geladen wird.
// Hält dynamisch erzeugte URLs im Proxy und meldet Titel/Adresse an die App.
(function () {
  'use strict';
  var script = document.currentScript;
  var cfg;
  try {
    cfg = JSON.parse(script.getAttribute('data-xs'));
  } catch (e) {
    return;
  }
  var PREFIX = '/web/' + cfg.key + '/';
  var proxyOrigin = location.origin && location.origin !== 'null' ? location.origin : location.protocol + '//' + location.host;
  var PROXY_ROOT = proxyOrigin + PREFIX;

  function realUrl() {
    var href = location.href;
    var idx = href.indexOf(PREFIX);
    if (idx < 0) return cfg.url;
    var rest = href.slice(idx + PREFIX.length).replace(/^(https?):\/(?!\/)/i, '$1://');
    return rest;
  }

  function toProxy(value) {
    if (value == null) return value;
    var str = String(value).trim();
    if (!str || str.charAt(0) === '#' || /^(data|javascript|mailto|tel|blob|about):/i.test(str)) return value;
    if (str.indexOf(PREFIX) === 0 || str.indexOf(PROXY_ROOT) === 0) return value;
    var abs;
    try {
      abs = new URL(str, realUrl());
    } catch (e) {
      return value;
    }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return value;
    if (abs.origin === proxyOrigin && abs.pathname.indexOf(PREFIX) === 0) return value;
    return PREFIX + abs.href;
  }

  // fetch / XHR
  if (window.fetch) {
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        if (typeof input === 'string' || input instanceof URL) input = toProxy(String(input));
        else if (input && input.url) input = new Request(toProxy(input.url), input);
      } catch (e) {
        /* unverändert */
      }
      return origFetch.call(this, input, init);
    };
  }
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var args = Array.prototype.slice.call(arguments);
    args[1] = toProxy(url);
    return origOpen.apply(this, args);
  };

  // Element-Eigenschaften (src/href/action)
  function patchProp(Ctor, prop) {
    if (!Ctor || !Ctor.prototype) return;
    var desc = Object.getOwnPropertyDescriptor(Ctor.prototype, prop);
    if (!desc || !desc.set) return;
    Object.defineProperty(Ctor.prototype, prop, {
      configurable: true,
      enumerable: desc.enumerable,
      get: desc.get,
      set: function (v) {
        desc.set.call(this, toProxy(v));
      },
    });
  }
  [
    [window.HTMLImageElement, 'src'],
    [window.HTMLScriptElement, 'src'],
    [window.HTMLIFrameElement, 'src'],
    [window.HTMLSourceElement, 'src'],
    [window.HTMLMediaElement, 'src'],
    [window.HTMLLinkElement, 'href'],
    [window.HTMLAnchorElement, 'href'],
    [window.HTMLFormElement, 'action'],
  ].forEach(function (p) {
    patchProp(p[0], p[1]);
  });

  var origSetAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    var n = String(name).toLowerCase();
    if (n === 'src' || n === 'href' || n === 'action' || n === 'poster' || n === 'formaction') value = toProxy(value);
    return origSetAttr.call(this, name, value);
  };

  // Verlauf (pushState/replaceState)
  ['pushState', 'replaceState'].forEach(function (fn) {
    var orig = history[fn];
    if (!orig) return;
    history[fn] = function (state, title, url) {
      if (url != null) url = toProxy(url);
      try {
        var r = orig.call(history, state, title, url);
        report();
        return r;
      } catch (e) {
        return undefined;
      }
    };
  });

  // Neue Fenster → neuer Tab im X-Station-Browser
  window.open = function (url) {
    if (url) {
      var target;
      try {
        target = new URL(String(url), realUrl()).href;
      } catch (e) {
        return null;
      }
      parent.postMessage({ xs: 'open', url: target }, '*');
    }
    return null;
  };

  document.addEventListener(
    'click',
    function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#' || /^javascript:/i.test(href)) return;
      var proxied = toProxy(href);
      if (a.target === '_blank') {
        ev.preventDefault();
        var abs = proxied.indexOf(PREFIX) === 0 ? proxied.slice(PREFIX.length) : href;
        parent.postMessage({ xs: 'open', url: abs }, '*');
        return;
      }
      if (proxied !== href) a.setAttribute('href', proxied);
    },
    true,
  );

  document.addEventListener(
    'submit',
    function (ev) {
      var form = ev.target;
      if (form && form.getAttribute) {
        var action = form.getAttribute('action');
        if (action) form.setAttribute('action', toProxy(action));
        if (form.target === '_blank' || form.target === '_top') form.target = '_self';
      }
    },
    true,
  );

  // Nachträglich eingefügte Elemente prüfen
  var ATTRS = ['src', 'href', 'action', 'poster'];
  function fixNode(node) {
    if (node.nodeType !== 1) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var v = node.getAttribute(ATTRS[i]);
      if (v && /^(https?:)?\/\//i.test(v)) {
        var p = toProxy(v);
        if (p !== v) origSetAttr.call(node, ATTRS[i], p);
      }
    }
  }
  if (window.MutationObserver) {
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var added = list[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          fixNode(added[j]);
          if (added[j].querySelectorAll) {
            var inner = added[j].querySelectorAll('[src],[href],[action]');
            for (var k = 0; k < inner.length; k++) fixNode(inner[k]);
          }
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  // Adresse & Titel an die App melden
  function favicon() {
    var link = document.querySelector('link[rel~="icon"]');
    var href = link ? link.getAttribute('href') : null;
    if (href && href.indexOf(PREFIX) === 0) href = href.slice(PREFIX.length);
    try {
      return new URL(href || '/favicon.ico', realUrl()).href;
    } catch (e) {
      return null;
    }
  }
  var lastReport = '';
  function report() {
    var msg = { xs: 'nav', url: realUrl(), title: document.title || '', favicon: favicon() };
    var s = JSON.stringify(msg);
    if (s === lastReport) return;
    lastReport = s;
    parent.postMessage(msg, '*');
  }
  report();
  document.addEventListener('DOMContentLoaded', report);
  window.addEventListener('load', report);
  window.addEventListener('popstate', report);
  window.addEventListener('hashchange', report);
  setInterval(report, 1500);

  // Befehle der App (Scrollen per Controller, Zurück/Vor)
  window.addEventListener('message', function (ev) {
    if (ev.source !== parent || !ev.data || !ev.data.xs) return;
    var d = ev.data;
    if (d.xs === 'scroll') window.scrollBy({ top: d.dy || 0, left: d.dx || 0, behavior: d.smooth ? 'smooth' : 'auto' });
  });

  // Tastatur: Escape/Home zurück an die App geben
  window.addEventListener(
    'keydown',
    function (ev) {
      if (ev.key === 'Escape' || ev.key === 'Home' || (ev.key === 'F1')) {
        parent.postMessage({ xs: 'key', key: ev.key }, '*');
      }
    },
    true,
  );
})();
