// Server-Sent Events: Live-Benachrichtigungen und Online-Status.

const OFFLINE_GRACE_MS = 6000;
const HEARTBEAT_MS = 25000;

export class EventHub {
  constructor() {
    this.clients = new Map(); // userId -> Set<res>
    this.offlineTimers = new Map();
    this.onPresenceChange = () => {};
    this.heartbeat = setInterval(() => {
      for (const set of this.clients.values()) for (const res of set) res.write(': ping\n\n');
    }, HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  isOnline(userId) {
    return (this.clients.get(userId)?.size || 0) > 0;
  }

  connect(userId, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');

    const wasOnline = this.isOnline(userId);
    clearTimeout(this.offlineTimers.get(userId));
    this.offlineTimers.delete(userId);

    if (!this.clients.has(userId)) this.clients.set(userId, new Set());
    this.clients.get(userId).add(res);
    if (!wasOnline) this.onPresenceChange(userId, true);

    res.on('close', () => {
      const set = this.clients.get(userId);
      if (!set) return;
      set.delete(res);
      if (set.size === 0) {
        this.clients.delete(userId);
        const t = setTimeout(() => {
          this.offlineTimers.delete(userId);
          if (!this.isOnline(userId)) this.onPresenceChange(userId, false);
        }, OFFLINE_GRACE_MS);
        t.unref();
        this.offlineTimers.set(userId, t);
      }
    });
  }

  send(userId, type, payload) {
    const set = this.clients.get(userId);
    if (!set) return;
    const msg = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of set) res.write(msg);
  }

  disconnectUser(userId) {
    const set = this.clients.get(userId);
    if (!set) return;
    for (const res of set) res.end();
  }

  close() {
    clearInterval(this.heartbeat);
    for (const t of this.offlineTimers.values()) clearTimeout(t);
    for (const set of this.clients.values()) for (const res of set) res.end();
    this.clients.clear();
  }
}
