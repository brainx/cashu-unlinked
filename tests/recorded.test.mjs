import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {canonicalRecordedPayload, inferRecordedCandidates, parseRecordedEvidence} from '../dist/recorded.js';
import {loadRecordedStore} from '../build/server/recorded-store.js';
import {createSessionStore} from '../build/server/session-store.js';
import {createServer} from '../build/server/http.js';

const fixturePath = new URL('../fixtures/recorded/cashu-blind.json', import.meta.url);
async function raw() { return JSON.parse(await readFile(fixturePath, 'utf8')); }
function resign(value) {
  value.integrity.digest = createHash('sha256').update(canonicalRecordedPayload(value)).digest('hex');
  return value;
}
function boundAnswer(evidence, sourceEventId = 'issuance-08') {
  return {runId: evidence.runId, evidenceDigest: evidence.integrity.digest, sourceEventId};
}

test('strictly parses recorded evidence and derives twelve candidates from observations', async () => {
  const input = resign(await raw());
  const parsed = parseRecordedEvidence(input);
  assert.notEqual(parsed, input);
  assert.equal(inferRecordedCandidates(parsed).candidateEventIds.length, 12);
  assert.throws(() => parseRecordedEvidence({...input, answerKey: {sourceEventId: 'issuance-08'}}), /Unknown field/);
  const nested = structuredClone(input); nested.provenance.sdk.extra = true;
  assert.throws(() => parseRecordedEvidence(nested), /Unknown field/);
});

test('fails closed on inconsistent proof, fee, keyset, and integrity metadata', async () => {
  for (const mutate of [
    value => { value.redemption.inputs.push(structuredClone(value.redemption.inputs[0])); },
    value => { value.redemption.inputFeeSat = 2; },
    value => { value.issuances[0].keysetId = 'unknown-keyset'; },
    value => { value.integrity.digest = '0'.repeat(63); },
  ]) {
    const value = await raw(); mutate(value);
    assert.throws(() => parseRecordedEvidence(value));
  }
});

test('rare denomination inference uses denomination, keyset, and time', async () => {
  const value = JSON.parse(await readFile(new URL('../fixtures/recorded/cashu-denomination.json', import.meta.url), 'utf8'));
  const expected = value.issuances.find(item => item.amountSat === value.redemption.inputAmountSat).eventId;
  assert.deepEqual(inferRecordedCandidates(parseRecordedEvidence(resign(value))).candidateEventIds, [expected]);
});

test('recorded store loads only valid fixed pairs and preserves first reveal', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'unlinked-recorded-')); t.after(() => rm(directory, {recursive: true, force: true}));
  const evidence = resign(await raw());
  await writeFile(join(directory, 'cashu-blind.json'), JSON.stringify(evidence));
  await writeFile(join(directory, 'cashu-blind.answer.json'), JSON.stringify(boundAnswer(evidence)));
  let now = 100;
  const store = await loadRecordedStore({fixturesDir: directory, ttlMs: 10, maxSessions: 2, now: () => now});
  assert.deepEqual(store.available(), ['cashu-blind']);
  const created = store.create('cashu-blind');
  assert.notEqual(created.sessionId, evidence.runId);
  assert.equal(Object.isFrozen(created.evidence), true);
  assert.equal(Object.isFrozen(created.evidence.provenance.keysets[0]), true);
  assert.throws(() => { created.evidence.integrity.digest = '0'.repeat(64); }, TypeError);
  const first = store.reveal(created.sessionId, 'insufficient-evidence');
  assert.equal(first.verdict.correct, true);
  assert.deepEqual(store.reveal(created.sessionId, 'insufficient-evidence'), first);
  assert.throws(() => store.reveal(created.sessionId, 'issuance-08'), error => error.statusCode === 409);
  const second = store.create('cashu-blind');
  assert.notEqual(second.evidence, created.evidence);
  assert.throws(() => { first.verdict.correct = false; }, TypeError);
  assert.throws(() => store.create('cashu-blind'), error => error.statusCode === 429);
  assert.throws(() => store.reveal('unknown-session', 'insufficient-evidence'), error => error.statusCode === 404);
  now = 111;
  assert.throws(() => store.reveal(second.sessionId, 'insufficient-evidence'), error => error.statusCode === 410);
  const replacement = store.create('cashu-blind');
  assert.throws(() => store.reveal(replacement.sessionId, 'not-an-event'), error => error.statusCode === 400);
});

test('digest mismatch excludes a fixture from availability', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'unlinked-recorded-bad-digest-')); t.after(() => rm(directory, {recursive: true, force: true}));
  const evidence = resign(await raw()); evidence.integrity.digest = '0'.repeat(64);
  await writeFile(join(directory, 'cashu-blind.json'), JSON.stringify(evidence));
  await writeFile(join(directory, 'cashu-blind.answer.json'), JSON.stringify(boundAnswer(evidence)));
  const store = await loadRecordedStore({fixturesDir:directory,ttlMs:1000,maxSessions:2,now:Date.now});
  assert.deepEqual(store.available(), []);
});

test('recorded answers must bind to the exact capture run and evidence digest', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'unlinked-recorded-pair-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const evidence = resign(await raw());
  await writeFile(join(directory, 'cashu-blind.json'), JSON.stringify(evidence));
  for (const answer of [
    {sourceEventId: 'issuance-08'},
    {...boundAnswer(evidence), runId: 'a-different-capture'},
    {...boundAnswer(evidence), evidenceDigest: '0'.repeat(64)},
    {...boundAnswer(evidence), extra: true},
  ]) {
    await writeFile(join(directory, 'cashu-blind.answer.json'), JSON.stringify(answer));
    const store = await loadRecordedStore({fixturesDir: directory, ttlMs: 1000, maxSessions: 2, now: Date.now});
    assert.deepEqual(store.available(), [], 'unbound or stale answers must make the capture unavailable');
  }
  await writeFile(join(directory, 'cashu-blind.answer.json'), JSON.stringify(boundAnswer(evidence)));
  const valid = await loadRecordedStore({fixturesDir: directory, ttlMs: 1000, maxSessions: 2, now: Date.now});
  assert.deepEqual(valid.available(), ['cashu-blind']);
});

test('recorded HTTP routes expose availability and keep answers reveal-only', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'unlinked-recorded-http-')); t.after(() => rm(directory, {recursive: true, force: true}));
  const evidence = resign(await raw());
  await writeFile(join(directory, 'cashu-blind.json'), JSON.stringify(evidence));
  await writeFile(join(directory, 'cashu-blind.answer.json'), JSON.stringify(boundAnswer(evidence)));
  const recordedStore = await loadRecordedStore({fixturesDir: directory, ttlMs: 1000, maxSessions: 2, now: Date.now});
  const syntheticStore = createSessionStore({ttlMs: 1000, maxSessions: 2, now: Date.now});
  const server = createServer(syntheticStore, {recordedStore}); server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const address = server.address(); const base = `http://127.0.0.1:${address.port}`;
  const available = await (await fetch(`${base}/api/captures`)).json();
  assert.deepEqual(available, {available: ['cashu-blind']});
  const createdResponse = await fetch(`${base}/api/recorded-runs`, {method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify({kind:'cashu-blind'})});
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.deepEqual(Object.keys(created), ['sessionId', 'evidence']);
  assert.equal(JSON.stringify(created).includes('sourceEventId'), false);
  const revealed = await fetch(`${base}/api/recorded-runs/${created.sessionId}/reveal`, {method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify({guess:'insufficient-evidence'})});
  assert.equal(revealed.status, 200);
  assert.equal((await revealed.json()).groundTruth.sourceEventId, 'issuance-08');
});

test('missing recorded fixtures report empty availability and 503 creation', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'unlinked-recorded-empty-')); t.after(() => rm(directory, {recursive: true, force: true}));
  const recordedStore = await loadRecordedStore({fixturesDir: directory, ttlMs: 1000, maxSessions: 2, now: Date.now});
  const server = createServer(createSessionStore({ttlMs:1000,maxSessions:2,now:Date.now}), {recordedStore});
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const address = server.address(); const base = `http://127.0.0.1:${address.port}`;
  assert.deepEqual(await (await fetch(`${base}/api/captures`)).json(), {available: []});
  assert.equal((await fetch(`${base}/api/recorded-runs`, {method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify({kind:'cashu-blind'})})).status, 503);
});
