import type {Observation, PrivateRun} from './contracts.js';
import {parseEvidence} from './validation.js';

const COMPATIBLE_COUNTS: readonly number[] = [1, 2, 4, 8, 12];
const DENOMINATIONS: readonly number[] = [8, 16, 32, 64];

function chooseIndex(count: number): number {
  const range = 2 ** 32;
  const cutoff = Math.floor(range / count) * count;
  const bytes = new Uint32Array(1);
  let draw: number;
  do { globalThis.crypto.getRandomValues(bytes); draw = bytes[0]!; } while (draw >= cutoff);
  return draw % count;
}

/** Server-side model generation only. The recipe is never accepted by the public API. */
export function createSyntheticChallenge(options: {compatibleCount?: number} = {}): PrivateRun {
  if (options === null || typeof options !== 'object' || Object.getPrototypeOf(options) !== Object.prototype ||
      Reflect.ownKeys(options).some(key => key !== 'compatibleCount') ||
      Object.getOwnPropertyDescriptor(options, 'compatibleCount')?.get ||
      Object.getOwnPropertyDescriptor(options, 'compatibleCount')?.set) {
    throw new TypeError('Challenge options must contain only compatibleCount');
  }
  const compatibleCount = Object.hasOwn(options, 'compatibleCount') ? options.compatibleCount : COMPATIBLE_COUNTS[chooseIndex(COMPATIBLE_COUNTS.length)]!;
  if (typeof compatibleCount !== 'number' || !COMPATIBLE_COUNTS.includes(compatibleCount)) throw new TypeError('compatibleCount must be 1, 2, 4, 8, or 12');

  const amountSat = DENOMINATIONS[chooseIndex(DENOMINATIONS.length)]!;
  const otherAmounts = DENOMINATIONS.filter(amount => amount !== amountSat);
  const redemptionTime = 5_000 + chooseIndex(1_000);
  const excludedCount = 12 - compatibleCount;
  // Nontrivial cases retain both a timing clue and a denomination clue.
  const lateCount = excludedCount === 0 ? 0 : 1 + chooseIndex(excludedCount - 1);
  const issuances: Observation[] = Array.from({length: 12}, (_, index) => {
    const compatible = index < compatibleCount;
    const late = !compatible && index < compatibleCount + lateCount;
    return {
      eventId: globalThis.crypto.randomUUID(),
      observedAtMs: late ? redemptionTime + 1 + chooseIndex(4_000) : 1_000 + chooseIndex(redemptionTime - 1_000),
      amountSat: compatible || late ? amountSat : otherAmounts[chooseIndex(otherAmounts.length)]!,
    };
  });
  for (let index = issuances.length - 1; index > 0; index--) {
    const other = chooseIndex(index + 1);
    [issuances[index], issuances[other]] = [issuances[other]!, issuances[index]!];
  }
  const evidence = parseEvidence({
    schemaVersion: 1, mode: 'synthetic', observer: 'mint', runId: globalThis.crypto.randomUUID(),
    kind: 'cashu-denomination', assumptions: ['closed-cohort', 'no-split-or-reissue'], issuances,
    redemption: {eventId: globalThis.crypto.randomUUID(), observedAtMs: redemptionTime, amountSat},
  });
  const compatibleSources = evidence.issuances.filter(item => item.amountSat === amountSat && item.observedAtMs <= redemptionTime);
  // Choose only after every public observation and its ordering have been fixed.
  const source = compatibleSources[chooseIndex(compatibleSources.length)]!;
  return {
    evidence,
    answerKey: {runId: evidence.runId, redemptionEventId: evidence.redemption.eventId, sourceEventId: source.eventId},
  };
}
