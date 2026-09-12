import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';

import {inferCandidates} from '../dist/observer.js';
import {createSyntheticRun} from '../dist/scenarios.js';
import {parseEvidence} from '../dist/validation.js';

const ROOT_FIELDS = [
  'assumptions', 'issuances', 'kind', 'mode', 'observer', 'redemption', 'runId', 'schemaVersion',
];
const OBSERVATION_FIELDS = ['amountSat', 'eventId', 'observedAtMs'];

function serializedObserverPayload(run) {
  return JSON.parse(JSON.stringify(parseEvidence(run.evidence)));
}

test('serialized observer payload contains exactly the public evidence contract', () => {
  const run = createSyntheticRun({kind: 'cashu-blind'});
  const payload = serializedObserverPayload(run);

  assert.deepEqual(Object.keys(payload).sort(), ROOT_FIELDS);
  for (const observation of [...payload.issuances, payload.redemption]) {
    assert.deepEqual(Object.keys(observation).sort(), OBSERVATION_FIELDS);
  }
  assert.deepEqual(payload, run.evidence);
});

test('private fields are rejected recursively before observer inference', () => {
  const run = createSyntheticRun({kind: 'cashu-blind'});
  const privateValues = [
    ['answerKey', run.answerKey],
    ['walletIdentity', 'wallet-private'],
    ['seed', 'seed-private'],
    ['secret', 'proof-private'],
    ['blindingFactor', 'blind-private'],
  ];

  for (const [field, value] of privateValues) {
    const rootLeak = structuredClone(run.evidence);
    rootLeak[field] = value;
    assert.throws(() => inferCandidates(rootLeak), /Unknown field/, `root ${field}`);

    const issuanceLeak = structuredClone(run.evidence);
    issuanceLeak.issuances[0][field] = value;
    assert.throws(() => inferCandidates(issuanceLeak), /Unknown field/, `issuance ${field}`);

    const redemptionLeak = structuredClone(run.evidence);
    redemptionLeak.redemption[field] = value;
    assert.throws(() => inferCandidates(redemptionLeak), /Unknown field/, `redemption ${field}`);
  }
});

test('permuting private answers cannot alter blind-issuance inference', () => {
  const run = createSyntheticRun({kind: 'cashu-blind'});
  const payload = serializedObserverPayload(run);
  const firstAnswer = run.answerKey;
  const secondAnswer = {...firstAnswer, sourceEventId: payload.issuances.find(
    issuance => issuance.eventId !== firstAnswer.sourceEventId,
  ).eventId};
  const firstPrivateRun = {...run, answerKey: firstAnswer};
  const secondPrivateRun = {...run, answerKey: secondAnswer};

  const firstPayload = serializedObserverPayload(firstPrivateRun);
  const secondPayload = serializedObserverPayload(secondPrivateRun);
  assert.notEqual(firstAnswer.sourceEventId, secondAnswer.sourceEventId);
  assert.deepEqual(secondPayload, firstPayload);
  assert.deepEqual(inferCandidates(secondPayload), inferCandidates(firstPayload));
  assert.equal(inferCandidates(firstPayload).candidateEventIds.length, 12);
});

test('production browser artifact excludes scenario answer generation', async () => {
  const assets = await readdir(new URL('../web/dist/assets/', import.meta.url));
  const scripts = assets.filter(name => name.endsWith('.js'));
  assert.ok(scripts.length > 0, 'expected a built browser script');
  assert.equal(assets.some(name => name.endsWith('.map')), false, 'browser source maps must stay disabled');

  const bundle = (await Promise.all(scripts.map(name =>
    readFile(join(new URL('../web/dist/assets/', import.meta.url).pathname, name), 'utf8'),
  ))).join('\n');
  for (const generatorOnlyMarker of [
    'candidateCount must be an integer between 2 and 64',
    'compatibleCount must be 1, 2, 4, 8, or 12',
    'Challenge options must contain only compatibleCount',
    'Use independent Web Crypto randomness',
    'Never derive the answer from public IDs or ordering',
  ]) {
    assert.equal(bundle.includes(generatorOnlyMarker), false, `browser bundle contains: ${generatorOnlyMarker}`);
  }
});
