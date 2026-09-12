import type { EvidenceView, DisplayObservation } from "../model";
import { issuanceLabel, timestamp } from "../content";

export function Inspector({
  evidence,
  selected,
  onChoose,
  locked,
  readOnly = false,
}: {
  evidence: EvidenceView;
  selected: string | null;
  onChoose: (eventId: string) => void;
  locked: boolean;
  readOnly?: boolean;
}) {
  const index = evidence.issuances.findIndex(
    (item) => item.eventId === selected,
  );
  const observation: DisplayObservation =
    evidence.issuances[index] ?? evidence.redemption;
  return (
    <div className="inspector">
      <div className="eyebrow">
        <span>01 / INSPECT</span>
        <span aria-hidden="true">⌕</span>
      </div>
      <h3>{index < 0 ? "The spent proof" : issuanceLabel(index)}</h3>
      {index >= 0 && <p className="target-reference">Target: {evidence.redemption.amountSat} sat · {timestamp(evidence.redemption.observedAtMs)}
        {evidence.redemption.serial && <span title={evidence.redemption.serial}> · serial …{evidence.redemption.serial.slice(-6)}</span>}</p>}
      <p className="inspector-intro">
        {index < 0
          ? "This proof arrived at the mint. Which issuance could it have come from?"
          : "An observed issuance batch. Inspect its details before choosing your hypothesis."}
      </p>
      <dl className="observation-data">
        <div>
          <dt>Denomination</dt>
          <dd>{observation.amountSat} sat</dd>
        </div>
        <div>
          <dt>Relative time</dt>
          <dd>{timestamp(observation.observedAtMs)}</dd>
        </div>
        <div>
          <dt>Visible serial</dt>
          <dd className="serial">{observation.serial ?? "Not observed"}</dd>
        </div>
        {observation.keysetId && (
          <div>
            <dt>Keyset</dt>
            <dd className="serial">{observation.keysetId}</dd>
          </div>
        )}
      </dl>
      {index >= 0 && !readOnly && (
        <button
          className="choose-button"
          disabled={locked}
          onClick={() => onChoose(observation.eventId)}
        >
          Choose this issuance <span aria-hidden="true">↗</span>
        </button>
      )}
      {index < 0 && !readOnly && (
        <p className="inspection-tip">
          <span aria-hidden="true">↖</span> Select an issuance record to
          inspect it.
        </p>
      )}
    </div>
  );
}
