/** Synthetic contract only. Real Cashu modes require a separately validated schema. */
export type ScenarioKind = 'account-ledger' | 'cashu-blind' | 'cashu-denomination';
export type ModelAssumption = 'closed-cohort' | 'no-split-or-reissue';
export interface Observation {
  readonly eventId: string;
  readonly observedAtMs: number;
  readonly amountSat: number;
  readonly serial?: string;
}
export interface Evidence {
  readonly schemaVersion: 1;
  readonly mode: 'synthetic';
  readonly observer: 'mint';
  readonly runId: string;
  readonly kind: ScenarioKind;
  readonly assumptions: readonly ModelAssumption[];
  readonly issuances: readonly Observation[];
  readonly redemption: Observation;
}
/** Never pass this to the observer or send it before reveal. */
export interface AnswerKey {
  readonly runId: string;
  readonly redemptionEventId: string;
  readonly sourceEventId: string;
}
export interface PrivateRun {
  readonly evidence: Evidence;
  readonly answerKey: AnswerKey;
}
export interface Inference {
  readonly strategy: 'serial-equality' | 'denomination-and-time';
  readonly candidateEventIds: readonly string[];
  readonly eliminated: readonly {eventId: string; reasons: readonly string[]}[];
  readonly assumptions: readonly ModelAssumption[];
  readonly interpretation: string;
}
export type Guess = string;
export interface Verdict {
  readonly correct: boolean;
  readonly evidenceSupported: boolean;
  readonly candidateCount: number;
  readonly sourceEventId: string;
  readonly explanation: string;
}
