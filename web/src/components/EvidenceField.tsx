import type { EvidenceView } from "../model";
import { issuanceLabel, timestamp } from "../content";
import {useRef, useState} from "react";
import type {ExplanationStep} from "../../../src/explanation.js";
import {ConnectionLines} from "./ConnectionLines";
import {assessmentLabels, type Assessments} from "./EvidenceNotes";

interface Props {
  evidence: EvidenceView;
  selected: string | null;
  guess: string | null;
  source: string | undefined;
  mechanism: string;
  onInspect: (eventId: string | null) => void;
  step: ExplanationStep | undefined;
  pins: readonly string[];
  assessments: Assessments;
  onShuffle: () => void;
}

export function EvidenceField({
  evidence,
  selected,
  guess,
  source,
  mechanism,
  onInspect,
  step,
  pins,
  assessments,
  onShuffle,
}: Props) {
  const canvas = useRef<HTMLDivElement>(null);
  const [order, setOrder] = useState<readonly string[]>([]);
  const [shuffleCount, setShuffleCount] = useState(0);
  const displayed = order.length ? order.flatMap(id => evidence.issuances.filter(item => item.eventId === id)) : evidence.issuances;
  function shuffle() {
    const ids = displayed.map(item => item.eventId);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    }
    if (ids.every((id, index) => id === displayed[index]?.eventId)) ids.push(ids.shift()!);
    setOrder(ids);
    setShuffleCount(count => count + 1);
    onShuffle();
  }
  const connected =
    source ?? (guess !== "insufficient-evidence" ? guess : null);
  const index = evidence.issuances.findIndex(
    (item) => item.eventId === connected,
  );
  return (
    <section className="evidence-field" id="evidence-board" aria-label="Issuance evidence field">
      <div className="field-meta">
        <span>
          <i className="status-dot" /> MINT OBSERVATION DESK
        </span>
        <div className="field-tools"><span>{evidence.issuances.length} SOURCES / 01 SPEND</span>
          <button className="shuffle-button" onClick={shuffle} aria-label="Shuffle desk" title="Rearrange the desk. Record identities stay the same.">⇄ <span>Shuffle desk</span></button></div>
      </div>
      <div className="field-canvas" ref={canvas}>
        <ConnectionLines canvas={canvas} ids={displayed.map(item => item.eventId)}
          hypothesis={!step && guess !== 'insufficient-evidence' ? guess : null} source={source}
          compatible={step?.id === 'compatible' || step?.id === 'truth' ? step.candidateEventIds : undefined} />
        <div className={`issuance-grid${shuffleCount ? shuffleCount % 2 ? ' shuffled-a' : ' shuffled-b' : ''}`}>
          {displayed.map(item => {
            const index = evidence.issuances.findIndex(source => source.eventId === item.eventId);
            return (
            <button
              key={item.eventId}
              className={`issuance ${selected === item.eventId ? "selected" : ""} ${source === item.eventId ? "ground-source" : ""} ${step ? step.candidateEventIds.includes(item.eventId) ? "compatible" : "ruled-out" : assessments[item.eventId] && assessments[item.eventId] !== 'keep' ? 'user-excluded' : ''}`}
              aria-label={`Inspect issuance ${index + 1}: ${item.amountSat} sats, ${timestamp(item.observedAtMs)}`}
              aria-pressed={selected === item.eventId}
              aria-describedby={`status-${item.eventId}${assessments[item.eventId] ? ` note-${item.eventId}` : ''}`}
              onClick={() => onInspect(item.eventId)}
            >
              <span className="receipt-top">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <span aria-hidden="true">{pins.includes(item.eventId) ? '⌖' : '↗'}</span>
              </span>
              <span className="receipt-amount">
                {item.amountSat}
                <small> sat</small>
              </span>
              <span className="receipt-time">
                {item.serial
                  ? `…${item.serial.slice(-6)}`
                  : timestamp(item.observedAtMs)}
              </span>
              <span className="receipt-status" id={`status-${item.eventId}`}>{step ? step.candidateEventIds.includes(item.eventId) ? step.id === 'compatible' || step.id === 'truth' ? 'Compatible' : 'Remaining' : 'Ruled out' : assessments[item.eventId] ? assessments[item.eventId] === 'keep' ? 'Shortlisted' : 'My exclusion' : ''}</span>
              {assessments[item.eventId] && <span className="sr-only" id={`note-${item.eventId}`}>My note: {assessmentLabels[assessments[item.eventId]!]}</span>}
              <span className="receipt-teeth" aria-hidden="true" />
            </button>
          );})}
        </div>
        <div className="mechanism">
          <span aria-hidden="true">
            {evidence.kind === "account-ledger" ? "↔" : "∅"}
          </span>
          <p aria-live="polite">{step ? `${step.title} · ${step.candidateEventIds.length} remaining` : mechanism}</p>
        </div>
        {index >= 0 && (
          <div className={`connection-label ${source ? "truth-label" : ""}`}>
            <b>{source ? "GROUND TRUTH" : "HYPOTHESIS"}</b>
            <span>{issuanceLabel(index)}</span>
          </div>
        )}
        <button
          className={`target-proof ${selected === null ? "target-selected" : ""}`}
          onClick={() => onInspect(null)}
          aria-label={`Inspect spent proof: ${evidence.redemption.amountSat} sats`}
          aria-pressed={selected === null}
        >
          <span className="proof-icon" aria-hidden="true">
            ↙
          </span>
          <span>
            <small>SPENT PROOF</small>
            <strong>
              {evidence.redemption.amountSat} <em>sat</em>
            </strong>
            {evidence.redemption.serial && (
              <small className="target-serial">
                …{evidence.redemption.serial.slice(-6)}
              </small>
            )}
          </span>
          <span className="target-time">
            {timestamp(evidence.redemption.observedAtMs)}
          </span>
        </button>
      </div>
      <div className="field-legend">
        <span>
          <i className="legend-observation" /> Observed event
        </span>
        <span>
          <i className={step ? "legend-compatible" : "legend-hypothesis"} /> {step ? "Compatible possibilities" : "Your hypothesis"}
        </span>
        <span>FAKE VALUE ONLY</span>
      </div>
    </section>
  );
}
