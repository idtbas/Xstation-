import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';

export async function startApp(opts = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xstation-test-'));
  const app = createApp({ dataDir, ...opts });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;

  async function call(method, url, body, token) {
    const res = await fetch(base + url, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data, headers: res.headers };
  }

  async function register(username, extra = {}) {
    const res = await call('POST', '/api/auth/register', { username, password: 'passwort123', acceptedTerms: '1.0', ...extra });
    if (res.status !== 201) throw new Error(`Registrierung fehlgeschlagen: ${JSON.stringify(res.data)}`);
    return res.data;
  }

  async function stop() {
    app.hub.close();
    await new Promise((resolve) => app.server.close(resolve));
    app.server.closeAllConnections?.();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  return { ...app, base, call, register, stop, dataDir };
}
