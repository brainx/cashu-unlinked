import { useEffect, useRef } from "react";
import type { Verdict } from "../../../src/contracts.js";
import type { ExplanationStep } from "../../../src/explanation.js";
import type { EvidenceView } from "../model";
import { issuanceLabel } from "../content";

export function RevealPanel({
  evidence,
  verdict,
  guess,
  onNext,
  steps,
  step,
  onStep,
  nextLabel,
  challenge = false,
}: {
  evidence: EvidenceView;
  verdict: Verdict;
  guess: string | null;
  onNext: () => void;
  steps: readonly ExplanationStep[];
  step: number;
  onStep: (step: number) => void;
  nextLabel?: string;
  challenge?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const focusStepRequested = useRef(false);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (focusStepRequested.current) {
      stepHeading.current?.focus({ preventScroll: true });
      focusStepRequested.current = false;
    }
  }, [step]);
  function navigateStep(next: number) {
    focusStepRequested.current = true;
    onStep(next);
  }
  const activeStep = steps[step];
  const truthVisible = activeStep?.id === "truth";
  const title =
    verdict.correct && verdict.evidenceSupported
      ? challenge
        ? "Your reasoning holds."
        : evidence.kind === "cashu-blind"
          ? "The evidence has a limit."
          : evidence.kind === "cashu-denomination"
            ? "The denomination leaves a clue."
            : "A trail you can follow."
      : verdict.correct
        ? "A lucky guess is still a guess."
        : "Follow the evidence once more.";
  return (
    <div className="reveal-panel" aria-label="Revealed result">
      <div className="eyebrow">03 / THE REVEAL</div>
      {truthVisible && <div className={`conclusion-stamp ${verdict.evidenceSupported ? 'stamp-supported' : 'stamp-unsupported'}`} role="status" aria-label="Case conclusion">
        <span>CASE REVIEWED</span><strong>{verdict.evidenceSupported ? 'JUSTIFIED' : verdict.correct ? 'LUCKY GUESS' : 'UNSUPPORTED'}</strong>
        <small>{verdict.evidenceSupported ? 'The observations support your conclusion' : 'The observations do not justify your answer'}</small>
      </div>}
      <span className="result-symbol" aria-hidden="true">
        {verdict.evidenceSupported ? "↗" : "∅"}
      </span>
      <h3 ref={heading} tabIndex={-1}>
        {title}
      </h3>
      <p className="candidate-count">
        {verdict.candidateCount} compatible issuance{" "}
        {verdict.candidateCount === 1 ? "event" : "events"}
      </p>
      {activeStep && (
        <section
          className="reveal-step"
          data-step={activeStep.id}
          aria-label="Evidence explanation"
        >
          <p className="eyebrow">STEP {step + 1} / {steps.length}</p>
          <h4 ref={stepHeading} tabIndex={-1}>
            {activeStep.title}
          </h4>
          <p>{activeStep.description}</p>
          <p className="step-count">
            {activeStep.candidateEventIds.length}{" "}
            {activeStep.candidateEventIds.length === 1
              ? "source remains"
              : "sources remain"}.
          </p>
          <nav className="reveal-step-controls" aria-label="Evidence steps">
            <button
              className="text-button"
              disabled={step === 0}
              onClick={() => navigateStep(step - 1)}
              aria-label="Previous evidence step"
            >
              <span aria-hidden="true">←</span> Previous
            </button>
            <button
              className="text-button"
              disabled={step === steps.length - 1}
              onClick={() => navigateStep(step + 1)}
              aria-label="Next evidence step"
            >
              Next <span aria-hidden="true">→</span>
            </button>
          </nav>
        </section>
      )}
      {truthVisible && <p>{verdict.explanation}</p>}
      {truthVisible && !verdict.evidenceSupported && (
        <p className="result-caution">
          {verdict.candidateCount > 1
            ? "Even a matching source guess would not be justified by these observations."
            : "Compare the target’s observed fields and the order of events."}
        </p>
      )}
      {truthVisible && (
        <dl className="result-facts">
          <div>
            <dt>Controlled source</dt>
            <dd>
              {issuanceLabel(
                evidence.issuances.findIndex(
                  (item) => item.eventId === verdict.sourceEventId,
                ),
              )}
            </dd>
          </div>
          <div>
            <dt>Your answer</dt>
            <dd>
              {guess === "insufficient-evidence"
                ? "Insufficient evidence"
                : issuanceLabel(
                    evidence.issuances.findIndex(
                      (item) => item.eventId === guess,
                    ),
                  )}
            </dd>
          </div>
        </dl>
      )}
      <p className="model-caveat">
        Under a closed cohort with no splitting or reissuance. Candidate count
        is not a probability.
      </p>
      {truthVisible && (
        <button className="primary-button" onClick={onNext}>
          {nextLabel ?? (evidence.kind === "cashu-denomination"
            ? "Start again"
            : "Continue to next act")}
          <span aria-hidden="true">→</span>
        </button>
      )}
    </div>
  );
}
