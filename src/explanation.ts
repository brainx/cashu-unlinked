import type {Evidence} from './contracts.js';
import type {RecordedCashuEvidence} from './recorded-contracts.js';
import {parseEvidence} from './validation.js';
import {parseRecordedEvidence} from './recorded.js';

export interface ExplanationStep {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly candidateEventIds: readonly string[];
  readonly eliminatedEventIds: readonly string[];
}

/** Each step uses observed fields only. Controlled answers cannot enter this boundary. */
export function buildExplanation(input: Evidence | RecordedCashuEvidence): readonly ExplanationStep[] {
  // Read the discriminator without executing an accessor before strict validation.
  const mode = input && Object.getOwnPropertyDescriptor(input, 'mode')?.value;
  const evidence = mode === 'recorded-cashu' ? parseRecordedEvidence(input) : parseEvidence(input);
  const steps: ExplanationStep[] = [];
  let candidates = evidence.issuances.map(item => item.eventId);
  function filter(id: string, title: string, reason: string, allowedIds: readonly string[]): void {
    const eliminatedEventIds = candidates.filter(eventId => !allowedIds.includes(eventId));
    candidates = candidates.filter(eventId => allowedIds.includes(eventId));
    const change = eliminatedEventIds.length === 0
      ? 'No remaining sources are eliminated by this check.'
      : `${eliminatedEventIds.length} ${eliminatedEventIds.length === 1 ? 'source is' : 'sources are'} eliminated by this check.`;
    steps.push({id, title, description: `${reason} ${change}`, candidateEventIds: [...candidates], eliminatedEventIds});
  }

  if (evidence.mode === 'synthetic' && evidence.kind === 'account-ledger') {
    filter('serial', 'Compare the visible serial',
      'The deliberately linkable reference model exposes the same serial at issuance and spending.',
      evidence.issuances.filter(item => item.serial === evidence.redemption.serial).map(item => item.eventId));
  }
  const targetAmount = evidence.mode === 'synthetic' ? evidence.redemption.amountSat : evidence.redemption.inputAmountSat;
  filter('denomination', 'Compare denominations',
    `The spent proof is ${targetAmount} sat. With no splitting or reissuance, its source must have the same denomination.`,
    evidence.issuances.filter(item => item.amountSat === targetAmount).map(item => item.eventId));

  if (evidence.mode === 'recorded-cashu') {
    const targetKeyset = evidence.redemption.inputs[0]!.keysetId;
    filter('keyset', 'Compare issuing keysets',
      'The spent input names its issuing keyset. A source on a different keyset cannot supply this unchanged proof.',
      evidence.issuances.filter(item => item.keysetId === targetKeyset).map(item => item.eventId));
  }
  filter('time', 'Check the order of events',
    'A source must have been issued no later than the target spend. Timing order alone does not link matching sources.',
    evidence.issuances.filter(item => item.observedAtMs <= evidence.redemption.observedAtMs).map(item => item.eventId));

  const count = candidates.length;
  const description = count === 0
    ? 'No compatible sources remain. The evidence or model assumptions may be incomplete; this does not identify a source.'
    : count === 1
      ? 'One source satisfies every observed constraint under the closed-cohort and no-split-or-reissue assumptions.'
      : `${count} sources satisfy every observed constraint. These observations cannot select a unique source under the stated assumptions.`;
  steps.push({id: 'compatible', title: 'What the evidence supports', description,
    candidateEventIds: [...candidates], eliminatedEventIds: []});
  steps.push({id: 'truth', title: 'The controlled answer',
    description: 'The experiment records its actual source separately. Knowing that answer does not narrow the set supported by these observations.',
    candidateEventIds: [...candidates], eliminatedEventIds: []});
  return steps;
}
