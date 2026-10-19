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

  // ---------- Controller-Steuerung aus der App (Cursor, Klicks, Texteingabe) ----------
  var CLICKABLE = 'a[href], button, input, select, textarea, label, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [onclick], [tabindex]';
  var TEXT_TYPES = { text: 1, search: 1, email: 1, url: 1, tel: 1, password: 1, number: 1 };
  var hoverEl = null;
  // Fremde Frames dürfen sich nicht selbst fokussieren – darum merken wir uns das Ziel-Feld.
  var targetField = null;

  function isTextField(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    if (el.tagName === 'TEXTAREA') return true;
    return el.tagName === 'INPUT' && (!el.type || TEXT_TYPES[el.type.toLowerCase()] === 1);
  }

  function mouse(el, type, x, y) {
    try {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 }));
    } catch (e) {
      /* ignorieren */
    }
  }

  function pointer(el, type, x, y) {
    try {
      el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: 'mouse', isPrimary: true }));
    } catch (e) {
      /* ältere Browser */
    }
  }

  function labelFor(field) {
    if (field.labels && field.labels[0]) return field.labels[0].textContent.trim();
    return field.getAttribute('aria-label') || field.placeholder || field.name || 'Eingabe';
  }

  function hover(x, y) {
    var el = document.elementFromPoint(x, y);
    if (el !== hoverEl) {
      if (hoverEl) {
        pointer(hoverEl, 'pointerout', x, y);
        mouse(hoverEl, 'mouseout', x, y);
      }
      hoverEl = el;
      if (el) {
        pointer(el, 'pointerover', x, y);
        mouse(el, 'mouseover', x, y);
      }
    }
    if (el) mouse(el, 'mousemove', x, y);
    var field = el && el.closest ? el.closest('input, textarea, select, [contenteditable]') : null;
    parent.postMessage({ xs: 'hover-info', link: !!(el && el.closest && el.closest(CLICKABLE)), text: isTextField(field) }, '*');
  }

  function click(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el) return;
    var field = el.closest ? el.closest('input, textarea, select, [contenteditable]') : null;
    if (field && field.tagName === 'SELECT') {
      targetField = field;
      field.focus();
      var opts = [];
      for (var i = 0; i < field.options.length; i++) opts.push(field.options[i].text);
      parent.postMessage({ xs: 'select', options: opts, index: field.selectedIndex, label: labelFor(field) }, '*');
      return;
    }
    if (isTextField(field)) {
      targetField = field;
      field.focus();
      parent.postMessage(
        {
          xs: 'input-focus',
          value: field.isContentEditable ? field.textContent : field.value,
          inputType: field.isContentEditable ? 'text' : (field.type || 'text').toLowerCase(),
          placeholder: field.placeholder || '',
          label: labelFor(field),
          maxLength: field.maxLength > 0 ? field.maxLength : 2000,
        },
        '*',
      );
      return;
    }
    pointer(el, 'pointerdown', x, y);
    mouse(el, 'mousedown', x, y);
    if (el.focus) {
      try {
        el.focus({ preventScroll: true });
      } catch (e) {
        /* nicht fokussierbar */
      }
    }
    pointer(el, 'pointerup', x, y);
    mouse(el, 'mouseup', x, y);
    if (typeof el.click === 'function') el.click();
    else mouse(el, 'click', x, y);
  }

  function setValue(value) {
    var el = targetField && targetField.isConnected ? targetField : document.activeElement;
    if (!isTextField(el)) return;
    if (el.isContentEditable) {
      el.textContent = value;
    } else {
      var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      var desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, value);
      else el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function key(el, type) {
    return el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  }

  function submit() {
    var el = targetField && targetField.isConnected ? targetField : document.activeElement;
    if (!el) return;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    var proceed = key(el, 'keydown');
    key(el, 'keypress');
    key(el, 'keyup');
    if (proceed && el.form && el.tagName !== 'TEXTAREA') {
      if (el.form.requestSubmit) el.form.requestSubmit();
      else el.form.submit();
    }
  }

  function setSelect(index) {
    var el = targetField && targetField.isConnected ? targetField : document.activeElement;
    if (!el || el.tagName !== 'SELECT') return;
    el.selectedIndex = index;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  window.addEventListener('message', function (ev) {
    if (ev.source !== parent || !ev.data || !ev.data.xs) return;
    var d = ev.data;
    if (d.xs === 'scroll') window.scrollBy({ top: d.dy || 0, left: d.dx || 0, behavior: d.smooth ? 'smooth' : 'auto' });
    else if (d.xs === 'hover') hover(d.x, d.y);
    else if (d.xs === 'click') click(d.x, d.y);
    else if (d.xs === 'set-value') setValue(String(d.value));
    else if (d.xs === 'submit') submit();
    else if (d.xs === 'set-select') setSelect(Number(d.index));
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
