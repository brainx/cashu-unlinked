import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSyntheticRun} from '../dist/scenarios.js';
import {evaluateGuess} from '../dist/evaluator.js';
import {inferRecordedCandidates} from '../dist/recorded.js';
import {buildCaseReceiptSvg} from '../dist/case-receipt.js';

test('synthetic receipt preserves justified uncertainty and keeps the controlled source separate', async () => {
  const run = createSyntheticRun({kind: 'cashu-blind'});
  const verdict = evaluateGuess(run.evidence, run.answerKey, 'insufficient-evidence');
  const svg = await buildCaseReceiptSvg(run.evidence, verdict, 'insufficient-evidence');
  assert.match(svg, /SYNTHETIC MODEL/);
  assert.match(svg, /FAKE VALUE ONLY/);
  assert.match(svg, /12 compatible issuance events/);
  assert.match(svg, /JUSTIFIED/);
  assert.match(svg, /Insufficient evidence for a unique source/);
  assert.match(svg, /Controlled source/);
  assert.match(svg, /Compatible sources/);
  assert.match(svg, /01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12/);
  assert.match(svg, /Candidate count is not a probability or privacy score/);
  assert.match(svg, /Closed cohort: the source is among these observed issuances/);
  assert.match(svg, /No splitting or reissuance of the target proof before redemption/);
  assert.doesNotMatch(svg, /blindedMessage|serial|answerKey|sourceEventId|seed|<script|<foreignObject|href=/);
  assert.ok(!svg.includes(run.evidence.runId), 'receipt does not export the full observation identifier');
});

test('receipt distinguishes a lucky source match from a justified conclusion and a wrong source', async () => {
  const run = createSyntheticRun({kind: 'cashu-blind'});
  const correctGuess = run.answerKey.sourceEventId;
  const lucky = await buildCaseReceiptSvg(run.evidence, evaluateGuess(run.evidence, run.answerKey, correctGuess), correctGuess);
  assert.match(lucky, /LUCKY GUESS/);
  assert.match(lucky, /Matches the controlled source; the evidence does not select it/);
  const wrongGuess = run.evidence.issuances.find(item => item.eventId !== correctGuess).eventId;
  const wrong = await buildCaseReceiptSvg(run.evidence, evaluateGuess(run.evidence, run.answerKey, wrongGuess), wrongGuess);
  assert.match(wrong, /UNSUPPORTED/);
  assert.match(wrong, /Your conclusion is not justified by these observations/);
});

for (const kind of ['cashu-blind', 'cashu-denomination']) {
  test(`${kind} receipt exports exact verified recording provenance without a raw trace`, async () => {
    const evidence = JSON.parse(await readFile(new URL(`../fixtures/recorded/${kind}.json`, import.meta.url), 'utf8'));
    const candidates = inferRecordedCandidates(evidence).candidateEventIds;
    const guess = candidates.length === 1 ? candidates[0] : 'insufficient-evidence';
    const verdict = {correct: true, evidenceSupported: true, candidateCount: candidates.length, sourceEventId: candidates[0], explanation: 'Fixture verdict'};
    const svg = await buildCaseReceiptSvg(evidence, verdict, guess);
    assert.match(svg, /RECORDED CASHU/);
    assert.match(svg, /Nutshell 0\.20\.2.*FakeWallet/);
    assert.match(svg, /cashu-ts 4\.10\.1/);
    assert.ok(svg.includes(evidence.integrity.digest));
    assert.ok(svg.includes(new Date(evidence.provenance.recordedAtMs).toISOString()));
    assert.match(svg, /Digest verifies consistency, not mint authenticity/);
    assert.doesNotMatch(svg, /blindedMessage|requestedOutputs|groupId|<script|<foreignObject|href=/);
    assert.ok(!svg.includes(evidence.issuances[0].requestedOutputs[0].blindedMessage));
  });
}

test('receipt fails closed on unknown fields and inconsistent conclusions', async () => {
  const run = createSyntheticRun({kind: 'cashu-denomination'});
  const guess = run.answerKey.sourceEventId;
  const verdict = evaluateGuess(run.evidence, run.answerKey, guess);
  for (const change of [
    {candidateCount: 12}, {correct: false}, {evidenceSupported: false},
    {sourceEventId: 'not-an-issuance'}, {extra: true}, {explanation: 12},
  ]) await assert.rejects(buildCaseReceiptSvg(run.evidence, {...verdict, ...change}, guess), /verdict/i);
  await assert.rejects(buildCaseReceiptSvg({...run.evidence, seed: 'private'}, verdict, guess), /Unknown field/);
  await assert.rejects(buildCaseReceiptSvg(run.evidence, verdict, 'unknown'), /guess/i);
  let accessed = false;
  const accessor = {...verdict};
  Object.defineProperty(accessor, 'correct', {get() { accessed = true; return true; }});
  await assert.rejects(buildCaseReceiptSvg(run.evidence, accessor, guess), /verdict/i);
  assert.equal(accessed, false);
});

test('receipt rejects a modified recording whose digest no longer matches', async () => {
  const evidence = JSON.parse(await readFile(new URL('../fixtures/recorded/cashu-blind.json', import.meta.url), 'utf8'));
  evidence.issuances[0].observedAtMs += 1;
  const verdict = {correct: true, evidenceSupported: true, candidateCount: 12, sourceEventId: evidence.issuances[0].eventId, explanation: ''};
  await assert.rejects(buildCaseReceiptSvg(evidence, verdict, 'insufficient-evidence'), /integrity/i);
});

test('receipt uses its own validated conclusion text and XML-escapes displayed punctuation', async () => {
  const run = createSyntheticRun({kind: 'cashu-denomination'});
  const guess = run.answerKey.sourceEventId;
  const verdict = {...evaluateGuess(run.evidence, run.answerKey, guess), explanation: '<script>alert("private")</script>'};
  const svg = await buildCaseReceiptSvg(run.evidence, verdict, guess);
  assert.match(svg, /OBSERVATIONS &amp; LIMITS/);
  assert.doesNotMatch(svg, /<script|alert\(/);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<title id="receipt-title">/);
  assert.equal(await buildCaseReceiptSvg(run.evidence, verdict, guess), svg, 'same observations produce the same receipt');
});
