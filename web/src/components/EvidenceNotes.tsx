import type { EvidenceView } from "../model";
import { issuanceLabel, timestamp } from "../content";

export type Assessment = "" | "keep" | "amount" | "time" | "serial" | "keyset";
export type Assessments = Readonly<Record<string, Assessment>>;
export const assessmentLabels: Record<Assessment, string> = {
  "": "Unreviewed", keep: "Keep on my shortlist", amount: "Exclude: denomination",
  time: "Exclude: timing", serial: "Exclude: serial", keyset: "Exclude: keyset",
};

export function NoteControls({evidence, selected, pins, assessment, onPin, onAssess, locked}: {
  evidence: EvidenceView; selected: string | null; pins: readonly string[];
  assessment: Assessment; onPin: (id: string) => void;
  onAssess: (id: string, value: Assessment) => void; locked: boolean;
}) {
  const item = evidence.issuances.find(source => source.eventId === selected);
  if (!item) return null;
  const pinned = pins.includes(item.eventId);
  return <div className="note-controls">
    <button className="pin-button" aria-pressed={pinned} disabled={!pinned && pins.length === 2}
      onClick={() => onPin(item.eventId)}>{pinned ? "Unpin comparison" : "Pin for comparison"} <span aria-hidden="true">⌖</span></button>
    {pins.length === 2 && !pinned && <p>Two records pinned. Unpin one to compare another.</p>}
    <label>My assessment
      <select aria-label="My assessment" value={assessment} disabled={locked}
        onChange={event => onAssess(item.eventId, event.target.value as Assessment)}>
        {(["", "keep", "amount", "time", ...(item.serial ? ["serial"] : []), ...(item.keysetId ? ["keyset"] : [])] as Assessment[])
          .map(value => <option key={value} value={value}>{assessmentLabels[value]}</option>)}
      </select>
    </label>
    <p>Your notes do not change the observed evidence.</p>
  </div>;
}

export function PinnedComparison({evidence, pins, assessments, onPin}: {
  evidence: EvidenceView; pins: readonly string[]; assessments: Assessments; onPin: (id: string) => void;
}) {
  if (!pins.length) return null;
  const items = pins.flatMap(id => evidence.issuances.filter(item => item.eventId === id));
  return <section className="comparison" aria-label="Pinned comparison">
    <div className="comparison-heading"><span className="eyebrow">YOUR COMPARISON</span><span>Observed values · your notes</span></div>
    <div className="comparison-records">
      {[evidence.redemption, ...items].map((item, index) => <article key={item.eventId}>
        <div className="comparison-title"><strong>{index === 0 ? "Spent proof" : issuanceLabel(evidence.issuances.findIndex(source => source.eventId === item.eventId))}</strong>
          {index > 0 && <button onClick={() => onPin(item.eventId)} aria-label={`Unpin ${issuanceLabel(evidence.issuances.findIndex(source => source.eventId === item.eventId))}`}>×</button>}</div>
        <dl><div><dt>Denomination</dt><dd>{item.amountSat} sat</dd></div>
          <div><dt>Relative time</dt><dd>{timestamp(item.observedAtMs)}</dd></div>
          {item.serial && <div><dt>Serial</dt><dd className="comparison-code">{item.serial}</dd></div>}
          {item.keysetId && <div><dt>Keyset</dt><dd className="comparison-code">{item.keysetId}</dd></div>}
        </dl>
        {index > 0 && <p>{assessmentLabels[assessments[item.eventId] ?? ""]}</p>}
      </article>)}
    </div>
  </section>;
}
