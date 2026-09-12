import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request} from 'node:http';
import {createSessionStore} from '../build/server/session-store.js';
import {createServer} from '../build/server/http.js';
import {inferCandidates} from '../build/src/observer.js';
import {evaluateGuess} from '../build/src/evaluator.js';
import {parseEvidence} from '../build/src/validation.js';

async function fixture(t, options = {}) {
  let now = 1_000;
  const store = createSessionStore({ttlMs: options.ttlMs ?? 1_000, maxSessions: options.maxSessions ?? 4, now: () => now});
  const server = createServer(store);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  return {store, base: `http://127.0.0.1:${server.address().port}`, advance(ms) { now += ms; }};
}

function post(base, path, body = {}, headers = {}) {
  return fetch(`${base}${path}`, {
    method: 'POST', headers: {'content-type': 'application/json', origin: base, ...headers}, body: JSON.stringify(body),
  });
}

test('challenge API creates only public synthetic evidence and retains one guess', async t => {
  const f = await fixture(t);
  const created = await post(f.base, '/api/challenges');
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('cache-control'), 'no-store');
  const body = await created.json();
  assert.deepEqual(Object.keys(body), ['evidence']);
  assert.deepEqual(body.evidence, parseEvidence(body.evidence));
  assert.equal(body.evidence.mode, 'synthetic');
  assert.equal(body.evidence.issuances.length, 12);
  assert.deepEqual(Object.keys(body.evidence).sort(), ['assumptions', 'issuances', 'kind', 'mode', 'observer', 'redemption', 'runId', 'schemaVersion']);
  for (const observation of [...body.evidence.issuances, body.evidence.redemption]) {
    assert.deepEqual(Object.keys(observation).sort(), ['amountSat', 'eventId', 'observedAtMs']);
  }
  const candidateIds = inferCandidates(body.evidence).candidateEventIds;
  const guess = candidateIds.length === 1 ? candidateIds[0] : 'insufficient-evidence';
  const path = `/api/runs/${body.evidence.runId}/reveal`;
  assert.equal((await post(f.base, path, {guess: 'missing-event'})).status, 400);
  const revealed = await post(f.base, path, {guess});
  assert.equal(revealed.status, 200);
  const result = await revealed.json();
  assert.equal(result.verdict.correct, true);
  assert.equal(result.verdict.evidenceSupported, true);
  assert.equal(result.verdict.candidateCount, candidateIds.length);
  assert.ok(candidateIds.includes(result.groundTruth.sourceEventId));
  assert.deepEqual(await (await post(f.base, path, {guess})).json(), result);
  const changedGuess = guess === 'insufficient-evidence' ? candidateIds[0] : 'insufficient-evidence';
  assert.equal((await post(f.base, path, {guess: changedGuess})).status, 409);
});

test('challenge API accepts only an empty object and enforces the existing origin and body bounds', async t => {
  const f = await fixture(t);
  for (const input of [{compatibleCount: 1}, {kind: 'cashu-blind'}, {seed: 123}, [], null, 'challenge']) {
    assert.equal((await post(f.base, '/api/challenges', input)).status, 400);
  }
  assert.equal((await post(f.base, '/api/challenges', {}, {origin: 'https://attacker.invalid'})).status, 400);
  const invalidHostStatus = await new Promise((resolve, reject) => {
    const req = request(`${f.base}/api/challenges`, {
      method: 'POST', headers: {'content-type': 'application/json', origin: f.base, host: 'attacker.invalid'},
    }, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    req.on('error', reject);
    req.end('{}');
  });
  assert.equal(invalidHostStatus, 400);
  assert.equal((await fetch(`${f.base}/api/challenges`, {method: 'POST', headers: {'content-type': 'application/json'}, body: '{}'})).status, 400);
  assert.equal((await post(f.base, '/api/challenges', {}, {'content-type': 'text/plain'})).status, 400);
  assert.equal((await post(f.base, '/api/challenges', 'x'.repeat(16 * 1024))).status, 413);
  assert.equal((await fetch(`${f.base}/api/challenges`)).status, 404);
  assert.equal((await post(f.base, '/api/challenges')).status, 201);
});

test('challenge and guided sessions share capacity and expiry limits', async t => {
  const f = await fixture(t, {maxSessions: 1, ttlMs: 10});
  const created = await post(f.base, '/api/challenges');
  assert.equal(created.status, 201);
  const {evidence} = await created.json();
  assert.equal((await post(f.base, '/api/challenges')).status, 429);
  assert.equal((await post(f.base, '/api/runs', {kind: 'cashu-blind'})).status, 429);
  f.advance(10);
  assert.equal((await post(f.base, `/api/runs/${evidence.runId}/reveal`, {guess: 'insufficient-evidence'})).status, 410);
  assert.equal((await post(f.base, '/api/runs', {kind: 'cashu-blind'})).status, 201);
  assert.equal((await post(f.base, '/api/challenges')).status, 429);
});

for (const compatibleCount of [1, 2, 4, 8, 12]) {
  test(`synthetic challenge supports ${compatibleCount} compatible sources without exposing its private answer`, async () => {
    const {createSyntheticChallenge} = await import('../build/src/challenges.js');
    const run = createSyntheticChallenge({compatibleCount});
    const inference = inferCandidates(run.evidence);
    assert.equal(run.evidence.mode, 'synthetic');
    assert.equal(run.evidence.kind, 'cashu-denomination');
    assert.equal(run.evidence.issuances.length, 12);
    assert.deepEqual(run.evidence.assumptions, ['closed-cohort', 'no-split-or-reissue']);
    assert.deepEqual(run.evidence, parseEvidence(run.evidence));
    assert.equal(inference.candidateEventIds.length, compatibleCount);
    assert.ok(inference.candidateEventIds.includes(run.answerKey.sourceEventId));
    assert.equal(evaluateGuess(run.evidence, run.answerKey, run.answerKey.sourceEventId).evidenceSupported, compatibleCount === 1);
    if (compatibleCount < 12) {
      assert.ok(run.evidence.issuances.some(item => item.amountSat !== run.evidence.redemption.amountSat));
      assert.ok(run.evidence.issuances.some(item => item.amountSat === run.evidence.redemption.amountSat && item.observedAtMs > run.evidence.redemption.observedAtMs));
    }
    const before = structuredClone(run.evidence);
    for (const sourceEventId of inference.candidateEventIds) {
      const alternativeAnswer = {...run.answerKey, sourceEventId};
      assert.equal(evaluateGuess(run.evidence, alternativeAnswer, sourceEventId).correct, true);
      assert.deepEqual(inferCandidates(run.evidence), inference);
    }
    assert.deepEqual(run.evidence, before);
  });
}

test('server-side challenge recipe rejects invalid options instead of weakening its bounded model', async () => {
  const {createSyntheticChallenge} = await import('../build/src/challenges.js');
  for (const options of [null, [], {compatibleCount: 0}, {compatibleCount: 3}, {compatibleCount: 13}, {compatibleCount: 1.5}, {compatibleCount: '1'}, {compatibleCount: null}, {compatibleCount: undefined}, {compatibleCount: NaN}, {compatibleCount: Infinity}, {seed: 1}]) {
    assert.throws(() => createSyntheticChallenge(options), TypeError);
  }
  assert.ok([1, 2, 4, 8, 12].includes(inferCandidates(createSyntheticChallenge().evidence).candidateEventIds.length));
});
