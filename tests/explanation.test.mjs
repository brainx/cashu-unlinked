import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildExplanation} from '../dist/explanation.js';
import {createSyntheticRun} from '../dist/scenarios.js';
import {inferCandidates} from '../dist/observer.js';
import {inferRecordedCandidates} from '../dist/recorded.js';

const fixture = async kind => JSON.parse(await readFile(new URL(`../fixtures/recorded/${kind}.json`, import.meta.url), 'utf8'));

function assertSequence(evidence) {
  const before = structuredClone(evidence);
  const steps = buildExplanation(evidence);
  const inference = evidence.mode === 'synthetic' ? inferCandidates(evidence) : inferRecordedCandidates(evidence);
  let remaining = evidence.issuances.map(item => item.eventId);
  for (const step of steps) {
    assert.equal(typeof step.title, 'string');
    assert.equal(typeof step.description, 'string');
    assert.ok(step.title.length && step.description.length);
    assert.deepEqual(step.eliminatedEventIds, remaining.filter(id => !step.candidateEventIds.includes(id)));
    assert.ok(step.candidateEventIds.every(id => remaining.includes(id)), 'eliminated candidates cannot reappear');
    remaining = step.candidateEventIds;
  }
  assert.equal(new Set(steps.map(step => step.id)).size, steps.length);
  assert.deepEqual(steps.at(-2).candidateEventIds, inference.candidateEventIds);
  assert.equal(steps.at(-2).id, 'compatible');
  assert.equal(steps.at(-1).id, 'truth');
  assert.deepEqual(steps.at(-1).candidateEventIds, inference.candidateEventIds, 'controlled truth cannot narrow observer evidence');
  assert.deepEqual(steps.at(-1).eliminatedEventIds, []);
  assert.deepEqual(evidence, before, 'explanation must not mutate evidence');
  assert.doesNotMatch(JSON.stringify(steps), /sourceEventId|answerKey|redemptionEventId|seed|walletIdentity/);
  return steps;
}

// These regressions catch omitted filters, reintroduced candidates, and answer-driven narrowing.
for (const kind of ['account-ledger', 'cashu-blind', 'cashu-denomination']) {
  test(`${kind} explanation follows the observer and keeps ground truth separate`, () => {
    const {evidence} = createSyntheticRun({kind});
    const steps = assertSequence(evidence);
    assert.deepEqual(steps.map(step => step.id), [
      ...(kind === 'account-ledger' ? ['serial'] : []), 'denomination', 'time', 'compatible', 'truth',
    ]);
    assert.equal(steps.at(-1).candidateEventIds.length, kind === 'cashu-blind' ? 12 : 1);
  });
}

for (const kind of ['cashu-blind', 'cashu-denomination']) {
  test(`${kind} recorded explanation agrees with captured denomination, keyset, and time inference`, async () => {
    const steps = assertSequence(await fixture(kind));
    assert.deepEqual(steps.map(step => step.id), ['denomination', 'keyset', 'time', 'compatible', 'truth']);
    assert.equal(steps.at(-1).candidateEventIds.length, kind === 'cashu-blind' ? 12 : 1);
  });
}

test('serial, denomination, and time eliminate only the surviving candidates at each step', () => {
  const {evidence} = createSyntheticRun({kind: 'account-ledger'});
  for (const [index, item] of evidence.issuances.entries()) {
    item.serial = index === 0 ? 'different' : evidence.redemption.serial;
    item.amountSat = index === 1 ? 16 : evidence.redemption.amountSat;
    item.observedAtMs = index === 2 ? evidence.redemption.observedAtMs + 1 : evidence.redemption.observedAtMs;
  }
  const steps = assertSequence(evidence);
  assert.deepEqual(steps.slice(0, 3).map(step => step.candidateEventIds.length), [11, 10, 9]);
  assert.deepEqual(steps.slice(0, 3).map(step => step.eliminatedEventIds), evidence.issuances.slice(0, 3).map(item => [item.eventId]));
});

test('recorded keyset filtering follows the spent input, not recipient outputs', async () => {
  const evidence = await fixture('cashu-blind');
  const alternateId = '02' + 'f'.repeat(64);
  evidence.provenance.keysets.push({...evidence.provenance.keysets[0], id: alternateId});
  evidence.issuances[0].keysetId = alternateId;
  evidence.issuances[0].requestedOutputs[0].keysetId = alternateId;
  for (const output of evidence.redemption.requestedOutputs) output.keysetId = alternateId;
  const steps = assertSequence(evidence);
  assert.equal(steps[0].candidateEventIds.length, 12);
  assert.equal(steps[1].candidateEventIds.length, 11);
  assert.deepEqual(steps[1].eliminatedEventIds, [evidence.issuances[0].eventId]);
});

test('non-eliminating steps explain that observation without inventing a discriminator', () => {
  const {evidence} = createSyntheticRun({kind: 'cashu-blind'});
  const steps = assertSequence(evidence);
  assert.match(steps[0].description, /no .* eliminated/i);
  assert.match(steps[1].description, /no .* eliminated/i);
  assert.match(steps.at(-1).description, /does not narrow/i);
});

test('zero candidates means incomplete evidence or assumptions, never identification', () => {
  const {evidence} = createSyntheticRun({kind: 'cashu-blind'});
  evidence.redemption.amountSat = 16;
  const steps = assertSequence(evidence);
  assert.deepEqual(steps.at(-1).candidateEventIds, []);
  assert.match(steps.at(-2).description, /no compatible/i);
  assert.match(steps.at(-2).description, /incomplete/i);
});

test('private answer fields and malformed observations fail closed in both modes', async () => {
  for (const evidence of [createSyntheticRun({kind: 'cashu-blind'}).evidence, await fixture('cashu-blind')]) {
    assert.throws(() => buildExplanation({...evidence, answerKey: {sourceEventId: evidence.issuances[0].eventId}}), /Unknown field/);
    const nested = structuredClone(evidence);
    nested.issuances[0].secret = 'must-not-escape';
    assert.throws(() => buildExplanation(nested), /Unknown field/);
    const missingAssumption = structuredClone(evidence);
    missingAssumption.assumptions = ['closed-cohort'];
    assert.throws(() => buildExplanation(missingAssumption), /assumptions/i);
  }
  assert.throws(() => buildExplanation(null), TypeError);
  const evidence = createSyntheticRun({kind: 'cashu-blind'}).evidence;
  let accessed = false;
  Object.defineProperty(evidence, 'mode', {get() { accessed = true; return 'synthetic'; }});
  assert.throws(() => buildExplanation(evidence), /accessors/);
  assert.equal(accessed, false);
});
