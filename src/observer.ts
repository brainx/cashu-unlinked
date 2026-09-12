import type {Inference} from './contracts.js';
import {parseEvidence} from './validation.js';

/** No ground truth, wallet state, source permutation, or scenario generator is available here. */
export function inferCandidates(input: unknown): Inference {
  const evidence = parseEvidence(input);
  const candidateEventIds: string[] = [];
  const eliminated: {eventId: string; reasons: string[]}[] = [];
  for (const source of evidence.issuances) {
    const reasons: string[] = [];
    if (source.observedAtMs > evidence.redemption.observedAtMs) reasons.push('Issuance occurred after the target redemption.');
    if (source.amountSat !== evidence.redemption.amountSat) reasons.push('Denomination differs under the no-split-or-reissue assumption.');
    if (evidence.kind === 'account-ledger' && source.serial !== evidence.redemption.serial) {
      reasons.push('Visible reference-model serial differs.');
    }
    if (reasons.length) eliminated.push({eventId: source.eventId, reasons});
    else candidateEventIds.push(source.eventId);
  }
  const count = candidateEventIds.length;
  const interpretation = count === 0
    ? 'No compatible issuance events under the stated model; evidence or assumptions may be incomplete.'
    : count === 1
      ? '1 compatible issuance event under the stated model; not a universal identification claim.'
      : `${count} compatible issuance events under the stated model; evidence does not select a unique source.`;
  return {
    strategy: evidence.kind === 'account-ledger' ? 'serial-equality' : 'denomination-and-time',
    candidateEventIds, eliminated, assumptions: evidence.assumptions, interpretation,
  };
}
