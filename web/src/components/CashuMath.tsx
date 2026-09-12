import {useState, type RefObject} from 'react';
import {illustrateBlinding, illustrateSwap} from '../../../src/lesson-math.js';
import '../cashu-math.css';

type Topic = 'blinding' | 'denominations' | 'probability';
const topics: readonly {id: Topic; label: string}[] = [
  {id: 'blinding', label: 'Blinding math'},
  {id: 'denominations', label: 'Denominations & fees'},
  {id: 'probability', label: 'Evidence & probability'},
];

export function CashuMath({detailsRef}: {detailsRef: RefObject<HTMLDetailsElement | null>}) {
  const [topic, setTopic] = useState<Topic>('blinding');
  const [factor, setFactor] = useState(9);
  const [amountText, setAmountText] = useState('13');
  const [feePpk, setFeePpk] = useState(100);
  const [unequal, setUnequal] = useState(false);
  const toy = illustrateBlinding(factor);
  const amount = Number(amountText);
  const amountValid = amountText.trim() !== '' && Number.isSafeInteger(amount) && amount >= 1 && amount <= 255;
  const swap = amountValid ? illustrateSwap(amount, feePpk) : null;
  const weights = unequal ? [9, 1] : [1, 1];
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  return <details className="cashu-math" id="cashu-math" ref={detailsRef}>
    <summary><span><strong>The math, made visible</strong><small>Change the numbers. See what stays true.</small></span><span aria-hidden="true">∑</span></summary>
    <section className="math-lab" aria-label="Cashu math lab">
      <div className="math-topics" role="group" aria-label="Math topic">
        {topics.map(item => <button key={item.id} aria-pressed={topic === item.id} onClick={() => setTopic(item.id)}>{item.label}</button>)}
      </div>
      {topic === 'blinding' && <div className="math-topic" data-topic="blinding">
        <div className="math-heading"><p className="eyebrow">01 / BLIND → SIGN → UNBLIND</p><h3>The extra term cancels.</h3><p>The wallet adds a disguise before signing and removes it afterward. The mint’s signature on the original point survives.</p></div>
        <div className="math-symbols">
          <dl><div><dt>Y = H(secret)</dt><dd>A hash-to-curve point</dd></div><div><dt>G</dt><dd>The curve’s generator point</dd></div><div><dt>r</dt><dd>Wallet’s private blinding scalar</dd></div><div><dt>k / K = kG</dt><dd>Mint’s private / public key</dd></div></dl>
          <ol className="math-derivation">
            <li><span>Blind</span><code>B′ = Y + rG</code></li>
            <li><span>Sign</span><code>C′ = kB′ = kY + krG</code></li>
            <li><span>Unblind</span><code>C = C′ − rK</code></li>
            <li className="math-cancellation"><span>Substitute</span><code>= kY + <mark>krG</mark> − <mark>rkG</mark> = kY</code></li>
          </ol>
        </div>
        <div className="math-toy-label"><strong>Arithmetic only — not Cashu cryptography</strong><p>Below, we replace curve points with tiny public integers modulo 97. This illustrates cancellation, not privacy or security. Y = 11 is an invented number, not a secret hash. No keys or proofs are created.</p></div>
        <div className="math-toy">
          <div className="math-fixed-values"><span>G = 5</span><span>k = 7</span><span>K = 35</span><span>Y = 11</span><span>mod 97</span></div>
          <label className="math-slider">Toy blinding factor r <output>{factor}</output><input aria-label="Toy blinding factor r" type="range" min="1" max="96" step="1" value={factor} onChange={event => setFactor(Number(event.target.value))} /></label>
          <div className="math-calculations">
            <div><span>BLINDED MESSAGE</span><p>(11 + {factor} × 5) mod 97</p><output aria-label="Blinded toy message">{toy.blinded}</output></div>
            <div><span>BLINDED SIGNATURE</span><p>7 × {toy.blinded} mod 97</p><output aria-label="Blinded toy signature">{toy.signed}</output></div>
            <div className="math-invariant"><span>UNBLINDED RESULT</span><p>({toy.signed} − {factor} × 35) mod 97</p><output aria-label="Unblinded toy result">{toy.unblinded}</output><small>= 7 × 11 mod 97, every time</small></div>
          </div>
          <p className="math-footnote">“mod 97” means the remainder from 0 to 96, wrapping negative values too. Try r = 3: 85 − 105 = −20 ≡ 77 (mod 97). Tiny integers—including zero residues—are valid here only as arithmetic examples.</p>
        </div>
        <p className="math-source">In real Cashu, k stays private and Y, G, K, B′, C′, C are curve points; r and k are scalars. <a href="https://cashubtc.github.io/nuts/00/#protocol" target="_blank" rel="noopener noreferrer">NUT-00 · Actual protocol equations ↗</a></p>
      </div>}
      {topic === 'denominations' && <div className="math-topic" data-topic="denominations">
        <div className="math-heading"><p className="eyebrow">02 / ADD THE PROOFS, COUNT THE INPUTS</p><h3>13 sats can be 8 + 4 + 1.</h3><p>For this example, assume a mint supports every power-of-two denomination. Binary decomposition gives one possible set of proofs; real wallets may also hold repeated denominations.</p></div>
        <div className="math-formula" role="math" aria-label="An amount is the sum of binary digits times powers of two"><span aria-hidden="true">a = ∑ b<sub>j</sub> 2<sup>j</sup> <small>where b<sub>j</sub> ∈ {'{0, 1}'}</small></span></div>
        <div className="math-inputs">
          <label>Example amount in sats<input type="number" min="1" max="255" step="1" value={amountText} aria-invalid={!amountValid} aria-describedby={!amountValid ? 'math-amount-error' : undefined} onChange={event => setAmountText(event.target.value)} /></label>
          <label>Example input fee<select aria-label="Example input fee" value={feePpk} onChange={event => setFeePpk(Number(event.target.value))}><option value="0">0 ppk / input</option><option value="100">100 ppk / input</option><option value="500">500 ppk / input</option><option value="1000">1,000 ppk / input</option></select></label>
        </div>
        {!swap ? <p role="alert" id="math-amount-error" className="math-error">Enter a whole number from 1 to 255 sats.</p> : <>
          <div className="math-proof-row"><span>EXAMPLE INPUTS</span><output aria-label="Example proof denominations">{swap.inputs.join(' + ')}</output><small>{swap.inputs.length} {swap.inputs.length === 1 ? 'proof' : 'proofs'} · total {amount} sat</small></div>
          <div className="math-fee-work">
            <div><span>SUM, THEN ROUND UP ONCE</span><code>fee = ⌈{swap.inputs.length} × {feePpk} / 1000⌉</code><p><output aria-label="Calculated input fee">{swap.fee}</output> sat mint input fee</p></div>
            <div><span>VALUE IS CONSERVED</span><code>{amount} − {swap.fee} = {swap.remaining} sat</code><p>Input value − fee = output value</p></div>
          </div>
          {swap.remaining === 0 ? <p className="math-zero" role="status">No spendable output remains. These inputs would leave nothing after fees; this is not a usable swap.</p> : <div className="math-proof-row math-proof-output"><span>EXAMPLE OUTPUTS</span><output aria-label="Example output denominations">{swap.outputs.join(' + ')}</output><small>Fresh proofs totaling {swap.remaining} sat</small></div>}
        </>}
        <p className="math-footnote">Hypothetical rates, all inputs from the same assumed keyset. 100 ppk means 0.1 sat per input, not 0.1% of the amount. Round the combined fee up once. Mint input fee only; Lightning fees excluded. This is a calculation, not a swap request.</p>
        <p className="math-source"><a href="https://cashubtc.github.io/nuts/02/#fees" target="_blank" rel="noopener noreferrer">NUT-02 · Fee rules ↗</a><a href="https://cashubtc.github.io/nuts/03/" target="_blank" rel="noopener noreferrer">NUT-03 · Swap conservation ↗</a></p>
      </div>}
      {topic === 'probability' && <div className="math-topic" data-topic="probability">
        <div className="math-heading"><p className="eyebrow">03 / COMPATIBILITY ≠ PROBABILITY</p><h3>Two possibilities do not force 50/50.</h3><p>Suppose two invented hypotheses, A and B, both fit an observation. To assign probabilities, you also need prior beliefs and a model of how likely that observation is under each hypothesis.</p></div>
        <div className="math-bayes" role="math" aria-label="Posterior probability of hypothesis i given evidence equals likelihood times prior, divided by the sum of likelihood times prior for every hypothesis"><span aria-hidden="true">P(H<sub>i</sub> | E) = <span className="math-fraction"><span>P(E | H<sub>i</sub>) · P(H<sub>i</sub>)</span><span>∑<sub>j</sub> P(E | H<sub>j</sub>) · P(H<sub>j</sub>)</span></span></span></div>
        <p className="math-assumption"><strong>Extra assumption:</strong> P(E | A) = P(E | B) = 1. The observation is equally likely under both hypotheses, so it does not favor either one.</p>
        <div className="math-priors" role="group" aria-label="Invented prior model"><button aria-pressed={!unequal} onClick={() => setUnequal(false)}>Equal priors</button><button aria-pressed={unequal} onClick={() => setUnequal(true)}>Unequal priors</button></div>
        <div className="math-probabilities">
          {weights.map((weight, index) => <div key={index}><div><strong>Hypothesis {index === 0 ? 'A' : 'B'}</strong><span>Prior: {weight}/{total}</span><output aria-label={`Hypothesis ${index === 0 ? 'A' : 'B'} probability`}>{weight / total * 100}%</output></div><meter min="0" max="1" value={weight / total} aria-label={`Illustrative posterior for hypothesis ${index === 0 ? 'A' : 'B'}`} /></div>)}
        </div>
        <p className="math-model-label">Invented probability models—not estimates for your investigation.</p>
        <p className="math-footnote">Both models leave exactly two compatible hypotheses. The probabilities differ because their assumed priors differ. Candidate counts alone supply neither those priors nor calibrated likelihoods. “12 compatible sources” on the desk is not “1 in 12” confidence.</p>
      </div>}
    </section>
  </details>;
}
