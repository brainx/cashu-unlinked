import type {
  GetInfoResponse,
  Proof,
  SerializedBlindedMessage,
} from '@cashu/cashu-ts';
import type {
  CashuCaptureKind,
  RecordedCashuEvidence,
  RecordedOutputObservation,
} from '../../src/recorded-contracts.js';

export type { CashuCaptureKind, RecordedCashuEvidence, RecordedOutputObservation } from '../../src/recorded-contracts.js';

export interface PrivateIssuance {
  eventId: string;
  observedAtMs: number;
  amountSat: number;
  quoteId: string;
  keysetId: string;
  requestedOutputs: SerializedBlindedMessage[];
  proofs: Proof[];
}

export interface PrivateRedemption {
  eventId: string;
  observedAtMs: number;
  inputProofs: Proof[];
  inputFeeSat: number;
  requestedOutputs: SerializedBlindedMessage[];
  receivedProofs: Proof[];
}

export interface PrivateCapture {
  kind: CashuCaptureKind;
  runId: string;
  targetIndex: number;
  sourceEventId: string;
  inputFeePpk: number;
  mintInfo: GetInfoResponse;
  issuances: PrivateIssuance[];
  redemption: PrivateRedemption;
}
