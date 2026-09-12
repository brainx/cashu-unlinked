import type { InvestigationEvidence, InvestigationInference } from "../model";
import { issuanceLabel } from "../content";

export function TechnicalDrawer({
  evidence,
  inference,
  showInference = true,
}: {
  evidence: InvestigationEvidence;
  inference: InvestigationInference;
  showInference?: boolean;
}) {
  return (
    <details className="technical-drawer" id="method">
      <summary>
        <span>
          <span aria-hidden="true">⌘</span> Under the hood{" "}
          <small>Observations, assumptions & limits</small>
        </span>
        <span aria-hidden="true">+</span>
      </summary>
      <div className="technical-content">
        <div>
          <div className="eyebrow">THE MODEL</div>
          <h3>Inspect the experiment, too.</h3>
          <p>
            The question is which observed issuance batch could have produced
            this spent proof. It does not identify a person or merchant.
          </p>
          <dl>
            <div>
              <dt>Data source</dt>
              <dd>
                {evidence.mode === "synthetic"
                  ? "Synthetic · schema 1"
                  : "Recorded Cashu · schema 2"}
              </dd>
            </div>
            <div>
              <dt>Observer scope</dt>
              <dd>
                {evidence.mode === "recorded-cashu"
                  ? evidence.observationScope
                  : "Mint · denomination, relative time"}
                {evidence.kind === "account-ledger"
                  ? ", visible reference serial"
                  : ""}
              </dd>
            </div>
            {showInference && <div>
              <dt>Strategy</dt>
              <dd>{inference.strategy}</dd>
            </div>}
            <div>
              <dt>Assumptions</dt>
              <dd>
                Closed cohort; no splitting or reissuance of the target proof.
              </dd>
            </div>
          </dl>
          {showInference && <p>{inference.interpretation}</p>}
          <p className="technical-note">
            {evidence.mode === "synthetic"
              ? "This is a synthetic interaction model. It contains no captured protocol trace."
              : "This is a sanitized recording of genuine fake-value mint operations. Relative times on the desk use the first issuance as zero; absolute timestamps remain in the JSON."}{" "}
            A finite experiment is not a cryptographic proof. The local machine
            owner can inspect server state.
          </p>
          <div className="lab-status">
            <strong>
              {evidence.mode === "recorded-cashu"
                ? "Recorded capture · mint stopped"
                : "Live Cashu lab unavailable"}
            </strong>
            <p>
              {evidence.mode === "recorded-cashu"
                ? "Replay uses the same captured cohort and controlled answer. The capture digest checks file consistency, not the authenticity of the mint claim."
                : "This scene uses synthetic evidence. Select a recorded source to inspect a validated capture when available. Replaying a capture is not running a live mint."}
            </p>
            {evidence.mode === "recorded-cashu" && (
              <dl className="capture-provenance">
                <div>
                  <dt>Mint</dt>
                  <dd>
                    Nutshell {evidence.provenance.mint.version} · FakeWallet
                  </dd>
                </div>
                <div>
                  <dt>SDK</dt>
                  <dd>cashu-ts {evidence.provenance.sdk.version}</dd>
                </div>
                <div>
                  <dt>Captured</dt>
                  <dd>
                    {new Date(evidence.provenance.recordedAtMs).toISOString()}
                  </dd>
                </div>
                <div>
                  <dt>Enabled advertised NUTs</dt>
                  <dd>{evidence.provenance.nuts.join(", ")}</dd>
                </div>
                <div>
                  <dt>Input fee</dt>
                  <dd>{evidence.redemption.inputFeeSat} sat</dd>
                </div>
                <div>
                  <dt>SHA-256</dt>
                  <dd>{evidence.integrity.digest}</dd>
                </div>
              </dl>
            )}
          </div>
        </div>
        <div>
          <div className="eyebrow">OBSERVER RECORD</div>
          <details className="json-details">
            <summary>View observation JSON</summary>
            <pre>{JSON.stringify(evidence, null, 2)}</pre>
          </details>
          {showInference ? <><h4>Compatible sources</h4>
          <p>
            {evidence.issuances
              .map((item, index) =>
                inference.candidateEventIds.includes(item.eventId)
                  ? issuanceLabel(index)
                  : null,
              )
              .filter(Boolean)
              .join(", ") || "None"}
          </p>
          <h4>Elimination reasons</h4>
          {inference.eliminated.length ? (
            <ul>
              {inference.eliminated.map((item) => (
                <li key={item.eventId}>
                  <strong>
                    {issuanceLabel(
                      evidence.issuances.findIndex(
                        (source) => source.eventId === item.eventId,
                      ),
                    )}
                  </strong>
                  : {item.reasons.join(" ")}
                </li>
              ))}
            </ul>
          ) : (
            <p>No observed source can be eliminated by this strategy.</p>
          )}</> : <p className="challenge-disclosure">The observations and assumptions are available now. Computed deductions appear after you submit your conclusion.</p>}
        </div>
      </div>
    </details>
  );
}
