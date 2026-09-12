import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from './http.js';
import {createSessionStore} from './session-store.js';
import {loadRecordedStore} from './recorded-store.js';

const portText = process.env.PORT ?? '3210';
const port = Number(portText);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const store = createSessionStore({ttlMs: 20 * 60 * 1000, maxSessions: 128, now: Date.now});
const recordedStore = await loadRecordedStore({fixturesDir: resolve(projectRoot, 'fixtures/recorded'), ttlMs: 20 * 60 * 1000, maxSessions: 128, now: Date.now});
const server = createServer(store, {staticDir: resolve(projectRoot, 'web/dist'), recordedStore});
server.listen(port, '127.0.0.1', () => {
  console.log(`UNLINKED local server listening at http://127.0.0.1:${port}`);
});

let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  const forceClose = setTimeout(() => server.closeAllConnections(), 5_000);
  forceClose.unref();
  server.close(() => clearTimeout(forceClose));
  server.closeIdleConnections();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
