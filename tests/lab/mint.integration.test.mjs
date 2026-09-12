import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  projectCapture,
  runCashuCapture,
  validateRecordedEvidence,
  writeRecordedEvidence,
} from '../../build/lab-project/lab/src/capture.js';

const mintUrl = process.env.UNLINKED_MINT_URL;
const captureKind = process.env.UNLINKED_CAPTURE_KIND;

test('recorded schema rejects synthetic evidence and private fields', () => {
  assert.throws(() => validateRecordedEvidence({ schemaVersion: 1, mode: 'synthetic' }));
  assert.throws(() =>
    validateRecordedEvidence({
      schemaVersion: 2,
      mode: 'recorded-cashu',
      answerKey: { sourceEventId: 'source-1' },
    }),
  );
});

test(
  'captures 12 genuine equal-denomination issuances and a recipient swap',
  { skip: mintUrl && captureKind === 'cashu-blind' ? false : 'requires isolated blind capture' },
  async () => {
    const capture = await runCashuCapture('cashu-blind', { mintUrl });
    assert.equal(capture.issuances.length, 12);
    assert.deepEqual(capture.issuances.map((event) => event.amountSat), Array(12).fill(8));
    assert.equal(capture.redemption.inputProofs.length, 1);
    assert.equal(capture.redemption.inputProofs[0]?.amount.toNumber(), 8);
    assert.equal(capture.sourceEventId, capture.issuances[capture.targetIndex]?.eventId);

    const evidence = projectCapture(capture);
    assert.equal(evidence.mode, 'recorded-cashu');
    assert.equal(evidence.schemaVersion, 2);
    assert.equal(evidence.issuances.length, 12);
    assert.equal(evidence.redemption.inputAmountSat, 8);
    assert.equal(
      evidence.issuances.filter((event) => event.amountSat === evidence.redemption.inputAmountSat)
        .length,
      12,
    );
    assert.equal(evidence.provenance.mint.version, '0.20.2');
    assert.equal(evidence.provenance.sdk.version, '4.10.1');
    assert.match(evidence.integrity.digest, /^[a-f0-9]{64}$/);
    assert.doesNotThrow(() => validateRecordedEvidence(evidence));

    const serialized = JSON.stringify(evidence);
    for (const forbidden of [
      'sourceEventId',
      'targetIndex',
      'answerKey',
      'secret',
      'blindingFactor',
      'mnemonic',
      'rawToken',
    ]) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
    const directory = await mkdtemp(join(tmpdir(), 'unlinked-recorded-'));
    try {
      const path = join(directory, 'blind.json');
      await writeRecordedEvidence(path, evidence);
      const text = await readFile(path, 'utf8');
      assert.deepEqual(validateRecordedEvidence(JSON.parse(text)), evidence);
      assert.equal(/"(?:secret|C|dleq|quoteId|sourceEventId|targetIndex)"\s*:/.test(text), false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  'captures a rare 64-sat issuance and spends that proof in the recipient swap',
  {
    skip:
      mintUrl && captureKind === 'cashu-denomination'
        ? false
        : 'requires isolated denomination capture',
  },
  async () => {
    const capture = await runCashuCapture('cashu-denomination', { mintUrl });
    assert.equal(capture.issuances.length, 12);
    assert.equal(capture.issuances.filter((event) => event.amountSat === 64).length, 1);
    assert.equal(capture.redemption.inputProofs[0]?.amount.toNumber(), 64);

    const evidence = projectCapture(capture);
    assert.equal(
      evidence.issuances.filter((event) => event.requestedOutputs[0]?.amountSat === 64).length,
      1,
    );
    assert.equal(evidence.redemption.inputAmountSat, 64);
    assert.equal(
      evidence.issuances.filter((event) => event.amountSat === evidence.redemption.inputAmountSat)
        .length,
      1,
    );
    assert.doesNotThrow(() => validateRecordedEvidence(evidence));
  },
);
