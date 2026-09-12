import type {ModelAssumption, Verdict} from './contracts.js';

export type CashuCaptureKind = 'cashu-blind' | 'cashu-denomination';
export interface RecordedOutputObservation {readonly amountSat: number; readonly keysetId: string; readonly blindedMessage: string}
export interface RecordedIssuanceObservation {
  readonly eventId: string; readonly observedAtMs: number; readonly amountSat: number; readonly keysetId: string;
  readonly groupId: string; readonly requestedOutputs: readonly RecordedOutputObservation[];
}
export interface RecordedRedemptionObservation {
  readonly eventId: string; readonly observedAtMs: number; readonly inputAmountSat: number; readonly inputFeeSat: number;
  readonly inputs: readonly {readonly amountSat: number; readonly keysetId: string}[];
  readonly groupId: string; readonly requestedOutputs: readonly RecordedOutputObservation[];
}
export interface RecordedCashuEvidence {
  readonly schemaVersion: 2; readonly mode: 'recorded-cashu'; readonly observer: 'isolated-mint'; readonly runId: string;
  readonly kind: CashuCaptureKind; readonly assumptions: readonly ['closed-cohort', 'no-split-or-reissue'];
  readonly observationScope: string; readonly issuances: readonly RecordedIssuanceObservation[];
  readonly redemption: RecordedRedemptionObservation;
  readonly provenance: {
    readonly captureVersion: 'unlinked-cashu-capture-v1';
    readonly sdk: {readonly name: '@cashu/cashu-ts'; readonly version: '4.10.1'};
    readonly mint: {readonly name: 'Nutshell'; readonly version: '0.20.2'; readonly backend: 'FakeWallet'; readonly unit: 'sat'};
    readonly nuts: readonly number[];
    readonly keysets: readonly {readonly id: string; readonly unit: 'sat'; readonly inputFeePpk: number}[];
    readonly feeScope: string; readonly source: 'native-loopback-capture'; readonly recordedAtMs: number;
  };
  readonly integrity: {readonly algorithm: 'sha256'; readonly scope: 'canonical-evidence-without-integrity'; readonly digest: string};
}
export interface RecordedInference {
  readonly strategy: 'denomination-keyset-and-time'; readonly candidateEventIds: readonly string[];
  readonly eliminated: readonly {readonly eventId: string; readonly reasons: readonly string[]}[];
  readonly assumptions: readonly ModelAssumption[]; readonly interpretation: string;
}
export interface RecordedRevealResult {
  readonly verdict: Verdict;
  readonly groundTruth: {readonly label: 'GROUND TRUTH'; readonly sourceEventId: string};
}
