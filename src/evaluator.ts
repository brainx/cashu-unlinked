import type {AnswerKey, Guess, Verdict} from './contracts.js';
import {parseEvidence} from './validation.js';
import {inferCandidates} from './observer.js';

/** Call only after submission. The returned sourceEventId is intentional post-reveal ground truth. */
export function evaluateGuess(input: unknown, answer: AnswerKey, guess: Guess): Verdict {
  const evidence = parseEvidence(input);
  const inference = inferCandidates(evidence);
  if (!answer || answer.runId !== evidence.runId || answer.redemptionEventId !== evidence.redemption.eventId ||
      !inference.candidateEventIds.includes(answer.sourceEventId)) {
    throw new TypeError('Answer key does not match this run, redemption, and model evidence');
  }
  if (typeof guess !== 'string' || (guess !== 'insufficient-evidence' && !evidence.issuances.some(i => i.eventId === guess))) {
    throw new TypeError('Unknown guess');
  }
  const count = inference.candidateEventIds.length;
  const abstain = guess === 'insufficient-evidence';
  const correct = abstain ? count > 1 : guess === answer.sourceEventId;
  const evidenceSupported = abstain ? count > 1 : correct && count === 1;
  let explanation: string;
  if (abstain) {
    explanation = count > 1
      ? `${count} compatible issuance events remain; these observations do not establish a unique source.`
      : 'One compatible issuance event remains under the stated assumptions.';
  } else if (correct && !evidenceSupported) {
    explanation = 'The guess matches the controlled answer, but these observations do not establish a unique source.';
  } else if (correct) {
    explanation = 'The guess matches the only compatible source under the stated assumptions.';
  } else {
    explanation = 'The guess does not match the controlled answer. This result does not establish a general privacy guarantee.';
  }
  return {correct, evidenceSupported, candidateCount: count, sourceEventId: answer.sourceEventId, explanation};
}
