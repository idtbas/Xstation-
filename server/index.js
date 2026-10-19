import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(__dirname, '..', 'data');

const { server, db } = createApp({
  dataDir: DATA_DIR,
  allowPrivateProxy: process.env.XSTATION_PROXY_ALLOW_PRIVATE === '1',
  trustProxy: process.env.TRUST_PROXY === '1',
});

server.listen(PORT, HOST, () => {
  console.log(`X-Station läuft auf http://localhost:${PORT}  (Daten: ${DATA_DIR})`);
});

function shutdown() {
  db.flush();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
