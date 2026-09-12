import {createReadStream} from 'node:fs';
import {realpath, stat} from 'node:fs/promises';
import {createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http';
import {extname, resolve, sep} from 'node:path';
import type {ScenarioKind} from '../src/contracts.js';
import {SessionError, type SessionStore} from './session-store.js';
import type {CashuCaptureKind} from '../src/recorded-contracts.js';
import type {RecordedStore} from './recorded-store.js';

const BODY_LIMIT = 16 * 1024;
const CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
const MIME: Readonly<Record<string, string>> = Object.freeze({
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
});

interface StaticOptions {readonly staticDir?: string; readonly recordedStore?: RecordedStore}

function securityHeaders(response: ServerResponse): void {
  response.setHeader('content-security-policy', CONTENT_SECURITY_POLICY);
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
}

function json(response: ServerResponse, status: number, value: unknown, noStore = false): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  if (noStore) response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(value));
}

function exactObject(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Object.keys(value);
  return keys.length === fields.length && fields.every(field => Object.hasOwn(value, field));
}

async function body(request: IncomingMessage): Promise<unknown> {
  if (request.headers['content-type']?.toLowerCase() !== 'application/json') throw new SessionError(400, 'Content-Type must be application/json');
  const declared = Number(request.headers['content-length']);
  if (Number.isFinite(declared) && declared > BODY_LIMIT) throw new SessionError(413, 'Request body exceeds 16 KiB');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > BODY_LIMIT) throw new SessionError(413, 'Request body exceeds 16 KiB');
    chunks.push(bytes);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new SessionError(400, 'Malformed JSON body'); }
}

function authorize(request: IncomingMessage): boolean {
  const address = request.socket.address();
  if (typeof address === 'string' || !('address' in address) || !request.headers.host) return false;
  const expectedHost = `${address.address}:${address.port}`;
  if (request.headers.host !== expectedHost) return false;
  if (request.headers.origin !== undefined && request.headers.origin !== `http://${expectedHost}`) return false;
  if (request.method === 'POST' && request.headers.origin !== `http://${expectedHost}`) return false;
  return true;
}

async function serveStatic(request: IncomingMessage, response: ServerResponse, staticDir: string): Promise<boolean> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  const url = new URL(request.url ?? '/', 'http://local.invalid');
  let pathname: string;
  try { pathname = decodeURIComponent(url.pathname); } catch { return false; }
  if (pathname.includes('\0')) return false;
  const root = resolve(staticDir);
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  let file = resolve(root, requested);
  if (file !== root && !file.startsWith(root + sep)) return false;
  try {
    const info = await stat(file);
    if (info.isDirectory()) file = resolve(file, 'index.html');
    const finalInfo = info.isDirectory() ? await stat(file) : info;
    if (!finalInfo.isFile()) return false;
    const [realRoot, realFile] = await Promise.all([realpath(root), realpath(file)]);
    if (realFile !== realRoot && !realFile.startsWith(realRoot + sep)) return false;
  } catch { return false; }
  response.statusCode = 200;
  response.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
  if (request.method === 'HEAD') { response.end(); return true; }
  createReadStream(file).on('error', () => response.destroy()).pipe(response);
  return true;
}

export function createServer(store: SessionStore, options: StaticOptions = {}): Server {
  const staticDir = options.staticDir ?? resolve('web/dist');
  const server = createHttpServer(async (request, response) => {
    try {
      securityHeaders(response);
      if (!authorize(request)) { json(response, 400, {error: 'Invalid Host or Origin'}); return; }
      const pathname = new URL(request.url ?? '/', 'http://local.invalid').pathname;
      if (request.method === 'GET' && pathname === '/api/health') {
        json(response, 200, {ok: true, mode: 'synthetic'}); return;
      }
      if (request.method === 'GET' && pathname === '/api/captures') {
        json(response, 200, {available: options.recordedStore?.available() ?? []}, true); return;
      }
      if (request.method === 'POST' && pathname === '/api/runs') {
        const input = await body(request);
        if (!exactObject(input, ['kind']) || typeof input.kind !== 'string') throw new SessionError(400, 'Body must contain only kind');
        const evidence = store.create(input.kind as ScenarioKind);
        json(response, 201, {evidence}, true); return;
      }
      if (request.method === 'POST' && pathname === '/api/challenges') {
        const input = await body(request);
        if (!exactObject(input, [])) throw new SessionError(400, 'Body must be an empty object');
        json(response, 201, {evidence: store.createChallenge()}, true); return;
      }
      if (request.method === 'POST' && pathname === '/api/recorded-runs') {
        const input = await body(request);
        if (!exactObject(input, ['kind']) || (input.kind !== 'cashu-blind' && input.kind !== 'cashu-denomination')) throw new SessionError(400, 'Body must contain only a recorded Cashu kind');
        if (!options.recordedStore) throw new SessionError(503, 'Recorded Cashu captures are unavailable');
        json(response, 201, options.recordedStore.create(input.kind as CashuCaptureKind), true); return;
      }
      const match = /^\/api\/runs\/([A-Za-z0-9][A-Za-z0-9_-]{0,79})\/reveal$/.exec(pathname);
      if (request.method === 'POST' && match) {
        const input = await body(request);
        if (!exactObject(input, ['guess']) || typeof input.guess !== 'string') throw new SessionError(400, 'Body must contain only guess');
        json(response, 200, store.reveal(match[1]!, input.guess), true); return;
      }
      const recordedMatch = /^\/api\/recorded-runs\/([A-Za-z0-9][A-Za-z0-9_-]{0,79})\/reveal$/.exec(pathname);
      if (request.method === 'POST' && recordedMatch) {
        const input = await body(request);
        if (!exactObject(input, ['guess']) || typeof input.guess !== 'string') throw new SessionError(400, 'Body must contain only guess');
        if (!options.recordedStore) throw new SessionError(503, 'Recorded Cashu captures are unavailable');
        json(response, 200, options.recordedStore.reveal(recordedMatch[1]!, input.guess), true); return;
      }
      if (pathname.startsWith('/api/')) { json(response, 404, {error: 'Not found'}); return; }
      if (await serveStatic(request, response, staticDir)) return;
      json(response, 404, {error: 'Not found'});
    } catch (error) {
      if (error instanceof SessionError) json(response, error.statusCode, {error: error.message}, true);
      else json(response, 500, {error: 'Internal server error'}, true);
    }
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  return server;
}
