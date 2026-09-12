import type { Evidence, Inference, Observation } from "../../src/contracts.js";
import type {
  RecordedCashuEvidence,
  RecordedInference,
} from "../../src/recorded-contracts.js";
import { inferCandidates } from "../../src/observer.js";
import { inferRecordedCandidates } from "../../src/recorded.js";

export type DataMode = "synthetic" | "recorded-cashu";
export type InvestigationEvidence = Evidence | RecordedCashuEvidence;
export type InvestigationInference = Inference | RecordedInference;
export type DisplayObservation = Observation & { readonly keysetId?: string };
export interface EvidenceView {
  readonly kind: Evidence["kind"];
  readonly runId: string;
  readonly mode: DataMode;
  readonly issuances: readonly DisplayObservation[];
  readonly redemption: DisplayObservation;
}

export function inferEvidence(
  evidence: InvestigationEvidence,
): InvestigationInference {
  return evidence.mode === "synthetic"
    ? inferCandidates(evidence)
    : inferRecordedCandidates(evidence);
}

/** Display relative times; keep the full captured timestamps and metadata in the inspector JSON. */
export function observationView(evidence: InvestigationEvidence): EvidenceView {
  if (evidence.mode === "synthetic") return evidence;
  const origin = Math.min(
    ...evidence.issuances.map((item) => item.observedAtMs),
  );
  return {
    kind: evidence.kind,
    runId: evidence.runId,
    mode: evidence.mode,
    issuances: evidence.issuances.map((item) => ({
      eventId: item.eventId,
      observedAtMs: item.observedAtMs - origin,
      amountSat: item.amountSat,
      keysetId: item.keysetId,
    })),
    redemption: {
      eventId: evidence.redemption.eventId,
      observedAtMs: evidence.redemption.observedAtMs - origin,
      amountSat: evidence.redemption.inputAmountSat,
      keysetId: evidence.redemption.inputs[0]!.keysetId,
    },
  };
}
