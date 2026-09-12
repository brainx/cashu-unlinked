import { createHash, randomInt, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { MintQuoteState, Wallet, type Amount, type MintQuoteBolt11Response } from '@cashu/cashu-ts';
import { canonicalRecordedPayload, parseRecordedEvidence } from '../../src/recorded.js';

import type {
  CashuCaptureKind,
  PrivateCapture,
  PrivateIssuance,
  RecordedCashuEvidence,
  RecordedOutputObservation,
} from './provenance.js';

const REQUIRED_MINT_URL = 'http://127.0.0.1:3338';

function canonicalDigest(value: RecordedCashuEvidence): string {
  return createHash('sha256').update(canonicalRecordedPayload(value)).digest('hex');
}

async function paidQuote(wallet: Wallet, amountSat: number): Promise<MintQuoteBolt11Response> {
  const created = await wallet.createMintQuoteBolt11(amountSat);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const checked = await wallet.checkMintQuoteBolt11(created.quote);
    if (checked.state === MintQuoteState.PAID) return checked;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`FakeWallet quote did not settle for ${amountSat} sat`);
}

function assertLoopbackMint(mintUrl: string): void {
  if (mintUrl !== REQUIRED_MINT_URL) {
    throw new Error(`Cashu lab mint must be ${REQUIRED_MINT_URL}`);
  }
}

function assertOwnedFakeMint(): void {
  const pid = Number(process.env.UNLINKED_MINT_PID);
  if (
    !Number.isSafeInteger(pid) ||
    pid <= 0 ||
    process.env.UNLINKED_MINT_BACKEND !== 'FakeWallet'
  ) {
    throw new Error('Cashu capture requires the project-owned FakeWallet mint launcher');
  }
  try {
    process.kill(pid, 0);
  } catch {
    throw new Error('Attested Cashu mint process is not running');
  }
}

function amountToNumber(amount: Amount): number {
  const value = amount.toNumber();
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid Cashu amount');
  return value;
}

export async function runCashuCapture(
  kind: CashuCaptureKind,
  options: { mintUrl: string },
): Promise<PrivateCapture> {
  assertLoopbackMint(options.mintUrl);
  assertOwnedFakeMint();
  const wallet = new Wallet(options.mintUrl, { unit: 'sat', secretsPolicy: 'random' });
  await wallet.loadMint();
  const mintInfo = await wallet.mint.getInfo();
  if (!mintInfo.version.includes('0.20.2')) {
    throw new Error(`Expected Nutshell 0.20.2, received ${mintInfo.version}`);
  }
  const mintMethod = mintInfo.nuts['4'].methods.find(
    (method) => method.method === 'bolt11' && method.unit === 'sat',
  );
  if (!mintMethod || mintInfo.nuts['4'].disabled) {
    throw new Error('Mint does not advertise enabled BOLT11 sat issuance');
  }

  const issuances: PrivateIssuance[] = [];
  const targetIndex = randomInt(12);
  for (let index = 0; index < 12; index += 1) {
    const amountSat = kind === 'cashu-denomination' && index === targetIndex ? 64 : 8;
    const quote = await paidQuote(wallet, amountSat);
    const preview = await wallet.prepareMint('bolt11', amountSat, quote, undefined, {
      type: 'random',
      denominations: [amountSat],
    });
    const observedAtMs = Date.now();
    const proofs = await wallet.completeMint(preview);
    if (proofs.length !== 1 || amountToNumber(proofs[0]!.amount) !== amountSat) {
      throw new Error(`Issuance ${index + 1} did not produce one ${amountSat}-sat proof`);
    }
    issuances.push({
      eventId: `issuance-${String(index + 1).padStart(2, '0')}`,
      observedAtMs,
      amountSat,
      quoteId: quote.quote,
      keysetId: preview.keysetId,
      requestedOutputs: preview.payload.outputs,
      proofs,
    });
  }

  const target = issuances[targetIndex]!;
  const recipient = new Wallet(options.mintUrl, { unit: 'sat', secretsPolicy: 'random' });
  await recipient.loadMint();
  const receivePreview = await recipient.prepareSwapToReceive(target.proofs);
  const observedAtMs = Date.now();
  const received = await recipient.completeSwap(receivePreview);
  const inputFeeSat = receivePreview.fees.toNumber();

  return {
    kind,
    runId: randomUUID(),
    targetIndex,
    sourceEventId: target.eventId,
    inputFeePpk: wallet.getKeyset(target.keysetId).fee,
    mintInfo,
    issuances,
    redemption: {
      eventId: 'redemption-01',
      observedAtMs,
      inputProofs: receivePreview.inputs,
      inputFeeSat,
      requestedOutputs: [...(receivePreview.keepOutputs ?? []), ...(receivePreview.sendOutputs ?? [])].map(
        (output) => output.blindedMessage,
      ),
      receivedProofs: received.keep,
    },
  };
}

function projectOutput(output: { amount: Amount; id: string; B_: string }): RecordedOutputObservation {
  return {
    amountSat: amountToNumber(output.amount),
    keysetId: output.id,
    blindedMessage: output.B_,
  };
}

export function projectCapture(capture: PrivateCapture): RecordedCashuEvidence {
  const keysets = new Map<string, number>();
  for (const issuance of capture.issuances) {
    keysets.set(issuance.keysetId, capture.inputFeePpk);
  }
  if (keysets.size !== 1) {
    throw new Error('Isolated capture requires one stable issuance keyset');
  }
  const enabledAdvertisedNuts = Object.entries(capture.mintInfo.nuts)
    .filter(([, value]) => {
      if (!value || typeof value !== 'object') return false;
      if ('supported' in value) return value.supported === true;
      if ('disabled' in value) {
        return value.disabled === false &&
          'methods' in value &&
          Array.isArray(value.methods) &&
          value.methods.some((method) => method.method === 'bolt11' && method.unit === 'sat');
      }
      return false;
    })
    .map(([nut]) => Number(nut))
    .filter(Number.isSafeInteger)
    .sort((a, b) => a - b);
  const evidenceWithoutIntegrity: Omit<RecordedCashuEvidence, 'integrity'> = {
    schemaVersion: 2,
    mode: 'recorded-cashu',
    observer: 'isolated-mint',
    runId: capture.runId,
    kind: capture.kind,
    assumptions: ['closed-cohort', 'no-split-or-reissue'],
    observationScope:
      'Mint HTTP operations: issuance and recipient-swap timing, integer sat amounts, keysets, input fees, request grouping, and blinded output requests. Spendable bearer material and wallet state are excluded.',
    issuances: capture.issuances.map((issuance) => ({
      eventId: issuance.eventId,
      observedAtMs: issuance.observedAtMs,
      amountSat: issuance.amountSat,
      keysetId: issuance.keysetId,
      groupId: `mint-${issuance.eventId}`,
      requestedOutputs: issuance.requestedOutputs.map(projectOutput),
    })),
    redemption: {
      eventId: capture.redemption.eventId,
      observedAtMs: capture.redemption.observedAtMs,
      inputAmountSat: capture.redemption.inputProofs.reduce(
        (sum, proof) => sum + amountToNumber(proof.amount),
        0,
      ),
      inputFeeSat: capture.redemption.inputFeeSat,
      inputs: capture.redemption.inputProofs.map((proof) => ({
        amountSat: amountToNumber(proof.amount),
        keysetId: proof.id,
      })),
      groupId: 'swap-redemption-01',
      requestedOutputs: capture.redemption.requestedOutputs.map(projectOutput),
    },
    provenance: {
      captureVersion: 'unlinked-cashu-capture-v1',
      sdk: { name: '@cashu/cashu-ts', version: '4.10.1' },
      mint: {
        name: 'Nutshell',
        version: '0.20.2',
        backend: 'FakeWallet',
        unit: 'sat',
      },
      nuts: enabledAdvertisedNuts,
      keysets: [...keysets].map(([id, inputFeePpk]) => ({ id, unit: 'sat', inputFeePpk })),
      feeScope: 'NUT-02 input_fee_ppk retained; redemption input fee is observed in sat.',
      source: 'native-loopback-capture',
      recordedAtMs: Date.now(),
    },
  };
  const evidence: RecordedCashuEvidence = {
    ...evidenceWithoutIntegrity,
    integrity: {
      algorithm: 'sha256',
      scope: 'canonical-evidence-without-integrity',
      digest: '',
    },
  };
  return {...evidence, integrity: {...evidence.integrity, digest: canonicalDigest(evidence)}};
}

export function validateRecordedEvidence(input: unknown): RecordedCashuEvidence {
  const parsed = parseRecordedEvidence(input);
  if (canonicalDigest(parsed) !== parsed.integrity.digest) {
    throw new Error('Recorded evidence digest mismatch');
  }
  const serialized = JSON.stringify(parsed);
  for (const forbidden of ['sourceEventId', 'targetIndex', 'answerKey', 'secret', 'blindingFactor']) {
    if (serialized.includes(forbidden)) throw new Error(`Private field detected: ${forbidden}`);
  }
  return parsed;
}

export async function writeRecordedEvidence(
  path: string,
  evidence: RecordedCashuEvidence,
): Promise<void> {
  validateRecordedEvidence(evidence);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
}

export type { PrivateCapture, RecordedCashuEvidence } from './provenance.js';
