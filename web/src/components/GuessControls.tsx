import type { EvidenceView } from "../model";
import { issuanceLabel } from "../content";

export function GuessControls({
  evidence,
  guess,
  locked,
  submitting,
  retry,
  onGuess,
  onReveal,
}: {
  evidence: EvidenceView;
  guess: string | null;
  locked: boolean;
  submitting: boolean;
  retry: boolean;
  onGuess: (guess: string) => void;
  onReveal: () => void;
}) {
  const index = evidence.issuances.findIndex((item) => item.eventId === guess);
  return (
    <div className="guess-controls">
      <div className="eyebrow">02 / MAKE YOUR CALL</div>
      <p className="chosen-guess" aria-live="polite">
        {index >= 0
          ? `${issuanceLabel(index)} selected`
          : guess
            ? "No unique source selected"
            : "A source, or a limit to the evidence?"}
      </p>
      <button
        className={`insufficient-button ${guess === "insufficient-evidence" ? "is-chosen" : ""}`}
        onClick={() => onGuess("insufficient-evidence")}
        disabled={locked}
        aria-pressed={guess === "insufficient-evidence"}
      >
        <span className="radio-mark" aria-hidden="true" /> Evidence is
        insufficient
      </button>
      <button
        className="primary-button"
        disabled={!guess || submitting || (locked && !retry)}
        onClick={onReveal}
      >
        {submitting
          ? "Revealing…"
          : retry
            ? "Retry same guess"
            : "Reveal result"}
        <span aria-hidden="true">↗</span>
      </button>
      <p className="submission-note">
        One submitted guess per run. Follow the evidence.
      </p>
    </div>
  );
}
