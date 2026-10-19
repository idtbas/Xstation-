import { prefs } from './store.js';
import { h } from './dom.js';

export function formatTime(date = new Date()) {
  const opts = { hour: '2-digit', minute: '2-digit', hour12: !prefs.get('clock24') };
  return date.toLocaleTimeString('de-DE', opts);
}

export function formatDate(ts) {
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function relativeTime(ts) {
  if (!ts) return '';
  const diff = Math.max(0, Date.now() - ts) / 1000;
  if (diff < 60) return 'gerade eben';
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
  const days = Math.floor(diff / 86400);
  return days === 1 ? 'gestern' : `vor ${days} Tagen`;
}

// Live-Uhr, die sich jede Sekunde aktualisiert und beim Entfernen aufräumt.
export function clockEl(cls = '') {
  const el = h('div', { class: cls });
  const tick = () => {
    if (!el.isConnected && el.dataset.started) return clearInterval(timer);
    el.dataset.started = '1';
    el.textContent = formatTime();
  };
  const timer = setInterval(tick, 1000);
  tick();
  return el;
}

export function greeting() {
  const hr = new Date().getHours();
  if (hr < 5) return 'Gute Nacht';
  if (hr < 11) return 'Guten Morgen';
  if (hr < 18) return 'Guten Tag';
  return 'Guten Abend';
}
