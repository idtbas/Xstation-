// API-Client. Spricht mit dem X-Station-Server – oder, falls keiner erreichbar ist
// (z. B. GitHub Pages), mit einem lokalen Ersatz im Browser.

import { createLocalBackend } from './local-backend.js';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function serverBackend() {
  let token = null;

  async function call(method, url, body) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
      throw new ApiError('Keine Verbindung zum X-Station-Server.', 0);
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* keine JSON-Antwort */
    }
    if (!res.ok) throw new ApiError(data?.error || `Fehler ${res.status}`, res.status);
    return data;
  }

  return {
    mode: 'server',
    setToken: (t) => (token = t),
    getToken: () => token,
    health: () => call('GET', '/api/health'),
    register: (data) => call('POST', '/api/auth/register', data),
    login: (data) => call('POST', '/api/auth/login', data),
    logout: () => call('POST', '/api/auth/logout'),
    me: () => call('GET', '/api/me'),
    updateMe: (patch) => call('PATCH', '/api/me', patch),
    setActivity: (activity) => call('POST', '/api/me/activity', { activity }),
    changePassword: (current, next) => call('POST', '/api/me/password', { current, next }),
    deleteAccount: (password) => call('DELETE', '/api/me', { password }),
    unlock: (id) => call('POST', `/api/achievements/${encodeURIComponent(id)}`),
    searchUsers: (q) => call('GET', `/api/users/search?q=${encodeURIComponent(q)}`),
    getUser: (id) => call('GET', `/api/users/${encodeURIComponent(id)}`),
    friends: () => call('GET', '/api/friends'),
    requestFriend: (target) => call('POST', '/api/friends/request', target),
    acceptFriend: (id) => call('POST', `/api/friends/${encodeURIComponent(id)}/accept`),
    declineFriend: (id) => call('POST', `/api/friends/${encodeURIComponent(id)}/decline`),
    cancelRequest: (id) => call('POST', `/api/friends/${encodeURIComponent(id)}/cancel`),
    removeFriend: (id) => call('DELETE', `/api/friends/${encodeURIComponent(id)}`),
    notifications: () => call('GET', '/api/notifications'),
    readNotifications: () => call('POST', '/api/notifications/read'),
    clearNotifications: () => call('DELETE', '/api/notifications'),
    conversations: () => call('GET', '/api/conversations'),
    messages: (id) => call('GET', `/api/messages/${encodeURIComponent(id)}`),
    sendMessage: (id, text) => call('POST', `/api/messages/${encodeURIComponent(id)}`, { text }),
    readMessages: (id) => call('POST', `/api/messages/${encodeURIComponent(id)}/read`),

    // Live-Ereignisse per Server-Sent Events (über fetch, damit der Token im Header bleibt)
    async events(onEvent, signal) {
      const res = await fetch('/api/events', { headers: { Authorization: `Bearer ${token}` }, signal });
      if (!res.ok || !res.body) throw new ApiError('Ereignisstrom nicht verfügbar', res.status);
      onEvent('open', {});
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          let type = 'message';
          let data = '';
          for (const line of chunk.split('\n')) {
            if (line.startsWith('event: ')) type = line.slice(7);
            else if (line.startsWith('data: ')) data += line.slice(6);
          }
          if (data) {
            try {
              onEvent(type, JSON.parse(data));
            } catch {
              /* ungültige Daten ignorieren */
            }
          }
        }
      }
    },
  };
}

export const api = {
  backend: null,
  get mode() {
    return this.backend?.mode;
  },
  async init() {
    const server = serverBackend();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch('/api/health', { signal: ctrl.signal });
      clearTimeout(timer);
      const data = await res.json();
      if (data?.mode === 'server') {
        this.backend = server;
        return this.backend;
      }
    } catch {
      /* kein Server */
    }
    this.backend = createLocalBackend();
    return this.backend;
  },
};

// Bequemer Zugriff: api.call.login(...) usw.
export const call = new Proxy(
  {},
  {
    get(_, prop) {
      return (...args) => api.backend[prop](...args);
    },
  },
);
