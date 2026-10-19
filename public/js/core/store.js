// Zentraler Zustand + Geräte-Einstellungen (localStorage).

export class Emitter {
  constructor() {
    this.handlers = new Map();
  }
  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }
  emit(type, payload) {
    for (const fn of this.handlers.get(type) || []) {
      try {
        fn(payload);
      } catch (err) {
        console.error(err);
      }
    }
  }
}

export const bus = new Emitter();

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Speicher voll oder gesperrt */
  }
}

// ---------- Laufzeitzustand ----------
const state = {
  user: null,
  friends: { friends: [], incoming: [], outgoing: [] },
  notifications: [],
  conversations: [],
  downloads: [],
  recent: [],
  music: { playing: false, station: null, track: null },
};

export const store = {
  get: (key) => state[key],
  set(key, value) {
    state[key] = value;
    bus.emit(`state:${key}`, value);
  },
  update(key, fn) {
    this.set(key, fn(state[key]));
  },
  on: (key, fn) => bus.on(`state:${key}`, fn),
};

// ---------- Geräte-Einstellungen ----------
const DEFAULTS = {
  accent: 'hybrid',
  sounds: true,
  volume: 0.6,
  reduceMotion: false,
  particles: true,
  textSize: 'normal',
  clock24: true,
  toasts: true,
  searchEngine: 'duckduckgo',
  browserProxy: true,
  homepage: 'xs://start',
  vibration: true,
  vibrationStrength: 0.7,
  deadzone: 0.2,
  cursorSpeed: 1,
};

let settings = { ...DEFAULTS, ...load('xs.settings', {}) };

export const prefs = {
  get: (key) => settings[key],
  all: () => ({ ...settings }),
  set(key, value) {
    settings = { ...settings, [key]: value };
    save('xs.settings', settings);
    applyPrefs();
    bus.emit('prefs', { key, value });
  },
  reset() {
    settings = { ...DEFAULTS };
    save('xs.settings', settings);
    applyPrefs();
  },
};

export function applyPrefs() {
  const root = document.documentElement;
  root.dataset.accent = settings.accent;
  root.dataset.motion =
    settings.reduceMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full';
  root.dataset.textsize = settings.textSize;
}

// ---------- Verlauf zuletzt genutzter Apps (für Control Center) ----------
export function pushRecent(entry) {
  store.update('recent', (list) => [entry, ...list.filter((e) => e.id !== entry.id)].slice(0, 6));
}
