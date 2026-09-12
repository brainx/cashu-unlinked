import type {Observation, PrivateRun, ScenarioKind} from './contracts.js';
import {parseEvidence} from './validation.js';

/** Use independent Web Crypto randomness; never derive the answer from public IDs or ordering. */
function chooseIndex(count: number): number {
  const range = 2 ** 32;
  const cutoff = Math.floor(range / count) * count;
  const bytes = new Uint32Array(1);
  let draw: number;
  do { globalThis.crypto.getRandomValues(bytes); draw = bytes[0]!; } while (draw >= cutoff);
  return draw % count;
}

/** No Cashu cryptography or real funds. This constructs explicitly labelled model data. */
export function createSyntheticRun(options: {kind: ScenarioKind; candidateCount?: number}): PrivateRun {
  if (!options || !['account-ledger', 'cashu-blind', 'cashu-denomination'].includes(options.kind)) {
    throw new TypeError('Unsupported kind');
  }
  const count = options.candidateCount ?? 12;
  if (!Number.isInteger(count) || count < 2 || count > 64) {
    throw new TypeError('candidateCount must be an integer between 2 and 64');
  }
  const sourceIndex = chooseIndex(count);
  const issuances: Observation[] = Array.from({length: count}, (_, index) => ({
    eventId: globalThis.crypto.randomUUID(), observedAtMs: 1000 + index * 10,
    amountSat: options.kind === 'cashu-denomination' && index === sourceIndex ? 64 : 8,
    ...(options.kind === 'account-ledger' ? {serial: globalThis.crypto.randomUUID()} : {}),
  }));
  const source = issuances[sourceIndex]!;
  const redemption: Observation = {
    eventId: globalThis.crypto.randomUUID(), observedAtMs: 5000, amountSat: source.amountSat,
    ...(options.kind === 'account-ledger' ? {serial: source.serial!} : {}),
  };
  const evidence = parseEvidence({
    schemaVersion: 1, mode: 'synthetic', observer: 'mint', runId: globalThis.crypto.randomUUID(),
    kind: options.kind, assumptions: ['closed-cohort', 'no-split-or-reissue'], issuances, redemption,
  });
  return {
    evidence,
    answerKey: {runId: evidence.runId, redemptionEventId: redemption.eventId, sourceEventId: source.eventId},
  };
}
