export function CashuDiagram({step, mintView}: {step: number; mintView: boolean}) {
  const frames = [
    {from: 'Your wallet', item: 'Payment quote', detail: 'Lightning invoice', to: 'Issuing mint', result: 'Backing funds', resultDetail: 'Held by the mint', arrow: 'Pay invoice'},
    {from: 'Your wallet', item: mintView ? 'Secret not visible' : 'Fresh secret', detail: mintView ? 'Never sent at issuance' : 'Known only to this wallet', to: 'Issuing mint', result: 'Blinded request', resultDetail: 'Value + keyset visible', arrow: 'Blind locally'},
    {from: 'Issuing mint', item: 'Blinded signature', detail: 'Signed without seeing the secret', to: 'Your wallet', result: mintView ? 'Result not visible' : 'Valid ecash proof', resultDetail: mintView ? 'Unblinded inside the wallet' : 'Secret + unblinded signature', arrow: 'Unblind locally'},
    {from: mintView ? 'Outside the mint' : 'Sender', item: mintView ? 'Handoff not observed' : 'Ecash token', detail: mintView ? 'No automatic transfer notification' : 'Ordinary bearer proofs', to: mintView ? 'Outside the mint' : 'Recipient', result: mintView ? 'No mint request required' : 'A received copy', resultDetail: mintView ? 'For the handoff itself' : 'Refresh before relying on it', arrow: mintView ? 'Not observed' : 'Private handoff'},
    {from: 'Recipient → mint', item: 'Received proofs', detail: 'Check once; consume on success', to: 'Mint → recipient', result: mintView ? 'Blinded replacements' : 'Fresh ecash proofs', resultDetail: mintView ? 'New secret not visible yet' : 'Unblinded only by recipient', arrow: 'Successful swap'},
    {from: 'Your wallet → mint', item: 'Proofs + invoice', detail: 'Melt quote includes fees', to: 'Lightning recipient', result: 'Bitcoin payment', resultDetail: 'Check final payment status', arrow: 'Mint pays out'},
  ];
  const frame = frames[step]!;
  return <figure className={`cashu-diagram cashu-diagram-${step}${mintView ? ' mint-perspective' : ''}`} aria-label="Conceptual Cashu payment diagram">
    <figcaption><span className="lesson-dot" /> Concept illustration · no protocol operations</figcaption>
    <div className="lesson-transfer">
      <div className="lesson-actor">
        <span className="lesson-actor-label">{frame.from}</span>
        <div className={`lesson-paper${mintView && (step === 1 || step === 3) ? ' lesson-covered' : ''}`}>
          <span className="lesson-paper-symbol" aria-hidden="true">{step === 0 || step === 5 ? '↗' : step === 4 ? '↻' : step === 1 ? '✳' : '◎'}</span>
          <strong>{frame.item}</strong><small>{frame.detail}</small>
          <span className="lesson-paper-rule" aria-hidden="true" />
          <span className="lesson-paper-foot">{step === 1 || step === 2 ? 'ONE PROOF · VALUE VISIBLE' : 'SCHEMATIC · NO REAL VALUE'}</span>
        </div>
      </div>
      <div className="lesson-transfer-arrow"><span>{frame.arrow}</span><b aria-hidden="true">→</b></div>
      <div className="lesson-actor">
        <span className="lesson-actor-label">{frame.to}</span>
        <div className={`lesson-paper lesson-paper-output${mintView && (step === 2 || step === 3) ? ' lesson-covered' : ''}`}>
          <span className="lesson-paper-symbol" aria-hidden="true">{step === 0 ? '₿' : step === 3 ? '⇄' : step === 5 ? '↗' : '✳'}</span>
          <strong>{frame.result}</strong><small>{frame.resultDetail}</small>
          <span className="lesson-paper-rule" aria-hidden="true" />
          <span className="lesson-paper-foot">{step === 4 ? 'OLD COPIES NOW SPENT' : step === 3 ? 'NOT YET REFRESHED' : step === 0 ? 'CUSTODY REQUIRES TRUST' : step === 5 ? 'ONLY COMPLETE WHEN PAID' : 'SIGNATURES, NOT ACCOUNTS'}</span>
        </div>
      </div>
    </div>
    <p className="lesson-diagram-note">{step === 4 ? 'The mint sees the inputs and blinded outputs together. The next unblinded spend has no direct signature link back.' : step === 3 ? 'The handoff is outside the mint. Token preparation and recipient refresh may still require mint requests.' : step === 1 || step === 2 ? 'The mint can see the denomination. The hidden part is the secret and its link to the blinded request.' : step === 0 ? 'This walkthrough follows a Lightning-funded mint. UNLINKED itself uses fake value only.' : 'The mint sees the payment request. Unlinkability does not make redemption trustless.'}</p>
  </figure>;
}
