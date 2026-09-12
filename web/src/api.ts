import type { Guess, ScenarioKind, Verdict } from "../../src/contracts.js";
import { parseEvidence } from "../../src/validation.js";
import {
  parseRecordedEvidence,
  canonicalRecordedPayload,
} from "../../src/recorded.js";
import {
  inferEvidence,
  type InvestigationEvidence,
  type DataMode,
} from "./model";

export interface PlayableRun {
  readonly sessionId: string;
  readonly evidence: InvestigationEvidence;
}

export interface RevealResponse {
  readonly verdict: Verdict;
  readonly groundTruth: {
    readonly label: "GROUND TRUTH";
    readonly sourceEventId: string;
  };
}

function exactKeys(value: object, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

async function post(
  path: string,
  value: unknown,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
    cache: "no-store",
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
  });
  if (!response.ok) {
    if (response.status === 410 || response.status === 404)
      throw new Error("This run has expired. Start a new run.");
    if (response.status === 429)
      throw new Error(
        "The local session limit is reached. Try again after older runs expire.",
      );
    if (response.status === 409)
      throw new Error(
        "A different guess was already submitted. Start a new run.",
      );
    throw new Error("The local server could not complete this request.");
  }
  return response.json();
}

export async function createRun(
  kind: ScenarioKind,
  signal: AbortSignal,
  mode: DataMode = "synthetic",
  challenge = false,
): Promise<PlayableRun> {
  if (challenge && mode !== "synthetic")
    throw new Error("Challenge cases require synthetic evidence.");
  const body = await post(
    challenge ? "/api/challenges" : mode === "synthetic" ? "/api/runs" : "/api/recorded-runs",
    challenge ? {} : { kind },
    signal,
  );
  if (
    !body ||
    typeof body !== "object" ||
    !("evidence" in body) ||
    !exactKeys(
      body,
      mode === "synthetic" ? ["evidence"] : ["sessionId", "evidence"],
    )
  ) {
    throw new Error("The server returned an invalid observation record.");
  }
  const evidence =
    mode === "synthetic"
      ? parseEvidence(body.evidence)
      : parseRecordedEvidence(body.evidence);
  if (evidence.kind !== kind)
    throw new Error("The server returned a different act.");
  if (evidence.mode === "recorded-cashu") {
    const bytes = new TextEncoder().encode(canonicalRecordedPayload(evidence));
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    const digest = Array.from(new Uint8Array(hash), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    if (digest !== evidence.integrity.digest)
      throw new Error("The recorded capture failed its integrity check.");
    if (
      !("sessionId" in body) ||
      typeof body.sessionId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(body.sessionId)
    ) {
      throw new Error("The recorded session identifier is invalid.");
    }
    return { evidence, sessionId: body.sessionId };
  }
  return { evidence, sessionId: evidence.runId };
}

export async function availableCaptures(
  signal: AbortSignal,
): Promise<readonly ScenarioKind[]> {
  const response = await fetch("/api/captures", {
    cache: "no-store",
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
  });
  if (!response.ok) return [];
  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== "object" ||
    !exactKeys(body, ["available"]) ||
    !("available" in body) ||
    !Array.isArray(body.available) ||
    body.available.some(
      (kind) => kind !== "cashu-blind" && kind !== "cashu-denomination",
    )
  )
    return [];
  return body.available;
}

export async function revealRun(
  evidence: InvestigationEvidence,
  guess: Guess,
  signal: AbortSignal,
  sessionId: string,
): Promise<RevealResponse> {
  const body = await post(
    `${evidence.mode === "synthetic" ? "/api/runs" : "/api/recorded-runs"}/${encodeURIComponent(sessionId)}/reveal`,
    { guess },
    signal,
  );
  if (
    !body ||
    typeof body !== "object" ||
    !exactKeys(body, ["verdict", "groundTruth"]) ||
    !("verdict" in body) ||
    !("groundTruth" in body)
  ) {
    throw new Error("The server returned an invalid result.");
  }
  const verdict = body.verdict;
  const truth = body.groundTruth;
  if (
    !verdict ||
    typeof verdict !== "object" ||
    !exactKeys(verdict, [
      "correct",
      "evidenceSupported",
      "candidateCount",
      "sourceEventId",
      "explanation",
    ]) ||
    !("correct" in verdict) ||
    typeof verdict.correct !== "boolean" ||
    !("evidenceSupported" in verdict) ||
    typeof verdict.evidenceSupported !== "boolean" ||
    !("candidateCount" in verdict) ||
    !Number.isSafeInteger(verdict.candidateCount) ||
    typeof verdict.candidateCount !== "number" ||
    verdict.candidateCount < 0 ||
    verdict.candidateCount > evidence.issuances.length ||
    !("sourceEventId" in verdict) ||
    typeof verdict.sourceEventId !== "string" ||
    !evidence.issuances.some(
      (item) => item.eventId === verdict.sourceEventId,
    ) ||
    !("explanation" in verdict) ||
    typeof verdict.explanation !== "string" ||
    verdict.explanation.length > 2000 ||
    !truth ||
    typeof truth !== "object" ||
    !exactKeys(truth, ["label", "sourceEventId"]) ||
    !("label" in truth) ||
    truth.label !== "GROUND TRUTH" ||
    !("sourceEventId" in truth) ||
    truth.sourceEventId !== verdict.sourceEventId
  ) {
    throw new Error("The server returned an invalid result.");
  }
  const candidates = inferEvidence(evidence).candidateEventIds;
  const correct =
    guess === "insufficient-evidence"
      ? candidates.length > 1
      : guess === verdict.sourceEventId;
  const supported =
    correct &&
    (guess === "insufficient-evidence"
      ? candidates.length > 1
      : candidates.length === 1);
  if (
    verdict.candidateCount !== candidates.length ||
    !candidates.includes(verdict.sourceEventId) ||
    verdict.correct !== correct ||
    verdict.evidenceSupported !== supported
  ) {
    throw new Error("The server returned an invalid result.");
  }
  return {
    verdict: {
      correct: verdict.correct,
      evidenceSupported: verdict.evidenceSupported,
      candidateCount: verdict.candidateCount,
      sourceEventId: verdict.sourceEventId,
      explanation: verdict.explanation,
    },
    groundTruth: {
      label: "GROUND TRUTH",
      sourceEventId: verdict.sourceEventId,
    },
  };
}
