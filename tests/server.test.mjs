import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises';
import {request as httpRequest} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSessionStore} from '../build/server/session-store.js';
import {createServer} from '../build/server/http.js';

async function fixture(options = {}) {
  let now = 1_000;
  const store = createSessionStore({ttlMs: options.ttlMs ?? 1_000, maxSessions: options.maxSessions ?? 4, now: () => now});
  const server = createServer(store, {staticDir: options.staticDir});
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  return {store, server, base, advance(ms) { now += ms; }};
}

async function post(base, path, body, headers = {}) {
  return fetch(`${base}${path}`, {method: 'POST', headers: {'content-type': 'application/json', origin: base, ...headers}, body});
}

function chunkedPost(base, path, chunks) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base);
    const request = httpRequest(url, {
      method: 'POST',
      headers: {'content-type': 'application/json', origin: base},
    }, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject);
    for (const chunk of chunks) request.write(chunk);
    request.end();
  });
}

test('creates evidence without leaking private answer fields', async t => {
  const f = await fixture(); t.after(() => f.server.close());
  const response = await post(f.base, '/api/runs', JSON.stringify({kind: 'cashu-blind'}));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('content-security-policy'), "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['evidence']);
  assert.equal(body.evidence.issuances.length, 12);
  assert.equal(JSON.stringify(body).includes('sourceEventId'), false);
  assert.equal(JSON.stringify(body).includes('answerKey'), false);
  assert.equal(JSON.stringify(f.store), '{}');
});

test('reveal is idempotent for the same guess and rejects a changed guess', async t => {
  const f = await fixture(); t.after(() => f.server.close());
  const created = await (await post(f.base, '/api/runs', JSON.stringify({kind: 'cashu-blind'}))).json();
  const path = `/api/runs/${created.evidence.runId}/reveal`;
  const first = await post(f.base, path, JSON.stringify({guess: 'insufficient-evidence'}));
  assert.equal(first.status, 200);
  const result = await first.json();
  assert.deepEqual(Object.keys(result), ['verdict', 'groundTruth']);
  assert.deepEqual(result.groundTruth, {label: 'GROUND TRUTH', sourceEventId: result.verdict.sourceEventId});
  assert.equal(result.verdict.correct, true);
  assert.deepEqual(await (await post(f.base, path, JSON.stringify({guess: 'insufficient-evidence'}))).json(), result);
  assert.equal((await post(f.base, path, JSON.stringify({guess: created.evidence.issuances[0].eventId}))).status, 409);
});

test('store enforces TTL, capacity, and valid guesses', async () => {
  let now = 10;
  const store = createSessionStore({ttlMs: 10, maxSessions: 1, now: () => now});
  const evidence = store.create('cashu-blind');
  assert.throws(() => store.create('cashu-blind'), error => error.statusCode === 429);
  assert.throws(() => store.reveal('unknown-run', 'insufficient-evidence'), error => error.statusCode === 404);
  assert.throws(() => store.reveal(evidence.runId, 'not-an-event'), error => error.statusCode === 400);
  now = 21;
  assert.throws(() => store.reveal(evidence.runId, 'insufficient-evidence'), error => error.statusCode === 410);
  assert.doesNotThrow(() => store.create('cashu-blind'));
});

test('maps unknown, expired, and full sessions to explicit HTTP statuses', async t => {
  const f = await fixture({ttlMs: 10, maxSessions: 1}); t.after(() => f.server.close());
  assert.equal((await post(f.base, '/api/runs/unknown/reveal', JSON.stringify({guess: 'insufficient-evidence'}))).status, 404);
  const created = await (await post(f.base, '/api/runs', JSON.stringify({kind: 'cashu-blind'}))).json();
  assert.equal((await post(f.base, '/api/runs', JSON.stringify({kind: 'cashu-blind'}))).status, 429);
  f.advance(11);
  assert.equal((await post(f.base, `/api/runs/${created.evidence.runId}/reveal`, JSON.stringify({guess: 'insufficient-evidence'}))).status, 410);
});

test('rejects malformed schemas, media types, oversized bodies, origins, and hosts', async t => {
  const f = await fixture(); t.after(() => f.server.close());
  assert.equal((await post(f.base, '/api/runs', JSON.stringify({kind: 'cashu-blind', extra: true}))).status, 400);
  assert.equal((await post(f.base, '/api/runs', '{', {})).status, 400);
  assert.equal((await post(f.base, '/api/runs', '{}', {'content-type': 'text/plain'})).status, 400);
  assert.equal((await post(f.base, '/api/runs', ' '.repeat(16 * 1024 + 1))).status, 413);
  assert.equal(await chunkedPost(f.base, '/api/runs', [' '.repeat(12 * 1024), ' '.repeat(5 * 1024)]), 413);
  assert.equal((await post(f.base, '/api/runs', '{}', {origin: 'https://attacker.invalid'})).status, 400);
  assert.equal((await fetch(`${f.base}/api/runs`, {method: 'POST', headers: {'content-type': 'application/json'}, body: '{}'})).status, 400);
  assert.equal((await post(f.base, '/api/runs', '{}', {host: 'attacker.invalid'})).status, 400);
  assert.equal((await fetch(`${f.base}/api/health`, {headers: {origin: 'https://attacker.invalid'}})).status, 400);
  assert.equal((await fetch(`${f.base}/api/health`, {headers: {origin: f.base}})).status, 200);
  assert.deepEqual(await (await fetch(`${f.base}/api/health`, {headers: {origin: f.base}})).json(), {ok: true, mode: 'synthetic'});
});

test('uses finite HTTP parser and request timeouts', async t => {
  const f = await fixture(); t.after(() => f.server.close());
  assert.ok(f.server.headersTimeout > 0 && f.server.headersTimeout <= 15_000);
  assert.ok(f.server.requestTimeout > 0 && f.server.requestTimeout <= 20_000);
});

test('serves only files contained by the configured static root', async t => {
  const parent = await mkdtemp(join(tmpdir(), 'unlinked-static-'));
  const root = join(parent, 'public');
  await mkdir(root);
  await writeFile(join(root, 'index.html'), '<h1>UNLINKED</h1>');
  await writeFile(join(parent, 'private.txt'), 'answer-key');
  await symlink(join(parent, 'private.txt'), join(root, 'escape.txt'));
  const f = await fixture({staticDir: root});
  t.after(() => f.server.close());
  t.after(() => rm(parent, {recursive: true, force: true}));
  const page = await fetch(`${f.base}/`);
  assert.equal(page.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"), true);
  assert.equal(page.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
  assert.equal(await page.text(), '<h1>UNLINKED</h1>');
  assert.equal((await fetch(`${f.base}/escape.txt`)).status, 404);
  assert.equal((await fetch(`${f.base}/../private.txt`)).status, 404);
});

test('returns explicit route and method errors', async t => {
  const f = await fixture(); t.after(() => f.server.close());
  assert.equal((await fetch(`${f.base}/api/missing`, {headers: {origin: f.base}})).status, 404);
  assert.equal((await fetch(`${f.base}/api/runs`, {headers: {origin: f.base}})).status, 404);
});
