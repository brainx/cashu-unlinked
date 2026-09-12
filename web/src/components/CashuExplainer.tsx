import {useEffect, useRef, useState} from 'react';
import {cashuQuestions, cashuSteps} from '../cashuLesson';
import {CashuDiagram} from './CashuDiagram';
import {CashuMath} from './CashuMath';
import '../cashu-explainer.css';

export function CashuExplainer() {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const stepTitle = useRef<HTMLHeadingElement>(null);
  const math = useRef<HTMLDetailsElement>(null);
  const focusStep = useRef(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [mintView, setMintView] = useState(false);
  const [answer, setAnswer] = useState<'copy' | 'refresh' | null>(null);
  const lesson = cashuSteps[step]!;

  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    element.showModal();
    element.scrollTop = 0;
    title.current?.focus({preventScroll: true});
  }, [open]);
  useEffect(() => {
    if (focusStep.current) {
      focusStep.current = false;
      stepTitle.current?.focus({preventScroll: true});
      stepTitle.current?.scrollIntoView({block: 'start', behavior: 'instant'});
    }
  }, [step]);
  function go(next: number) {
    const index = Math.max(0, Math.min(cashuSteps.length - 1, next));
    if (index === step) return;
    focusStep.current = true;
    setStep(index);
  }
  function close() { dialog.current?.close(); }

  return <>
    <button className="cashu-explainer-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog">
      <span aria-hidden="true">◎</span> How Cashu works
    </button>
    <dialog className="cashu-explainer" ref={dialog} onClose={() => setOpen(false)} aria-labelledby="cashu-explainer-title">
      {open && <>
        <div className="lesson-topbar">
          <span>UNLINKED <i>/</i> FIELD GUIDE 01</span>
          <div className="lesson-pagination" aria-label="Walkthrough navigation">
            <button disabled={step === 0} onClick={() => go(step - 1)} aria-label="Previous Cashu step">←</button>
            <span>{step + 1} / {cashuSteps.length}</span>
            <button disabled={step === cashuSteps.length - 1} onClick={() => go(step + 1)} aria-label="Next Cashu step">→</button>
          </div>
          <button className="lesson-close" aria-label="Close Cashu explainer" onClick={close}>Close <span aria-hidden="true">×</span></button>
        </div>
        <header className="lesson-intro">
          <p className="eyebrow">A PAYMENT, FROM BOTH SIDES</p>
          <h2 id="cashu-explainer-title" ref={title} tabIndex={-1}>How Cashu works</h2>
          <p className="lesson-deck">Digital cash you can hand over.<br /><em>A mint that signs without seeing the secret.</em></p>
          <p className="lesson-intro-note">Follow a payment from Lightning to ecash and back. Compare what the wallet and mint can see at each step.</p>
          <button className="lesson-math-jump" onClick={() => {
            if (!math.current) return;
            math.current.open = true;
            math.current.scrollIntoView({block: 'start', behavior: 'instant'});
            math.current.querySelector('summary')?.focus({preventScroll: true});
          }}><span aria-hidden="true">∑</span> Explore the math</button>
        </header>
        <nav className="lesson-chapters" aria-label="Cashu steps">
          {cashuSteps.map((item, index) => <button key={item.label} aria-label={`${index + 1}. ${item.label}`} aria-current={step === index ? 'step' : undefined} onClick={() => go(index)}>
            <span>{String(index + 1).padStart(2, '0')}</span><strong>{item.label}</strong>
          </button>)}
        </nav>
        <section className="lesson-walkthrough" aria-label="Cashu walkthrough">
          <div className="lesson-step-heading">
            <p className="eyebrow">STEP {step + 1} OF {cashuSteps.length} <span aria-hidden="true">/</span> {lesson.label.toUpperCase()}</p>
            <h3 ref={stepTitle} tabIndex={-1}>{lesson.title}</h3>
            <p>{lesson.explanation}</p>
          </div>
          <div className="lesson-perspective-control" role="group" aria-label="Viewing perspective">
            <span>Look through</span>
            <button aria-pressed={!mintView} onClick={() => setMintView(false)}>Wallet view</button>
            <button aria-pressed={mintView} onClick={() => setMintView(true)}>Mint view</button>
          </div>
          <CashuDiagram step={step} mintView={mintView} />
          <div className="lesson-perspective-note" role="status">
            <strong>{mintView ? 'What the mint sees' : 'What the wallet knows'}</strong>
            <p>{mintView ? lesson.mint : lesson.wallet}</p>
          </div>
          <div className="lesson-takeaway"><span aria-hidden="true">↳</span><p>{lesson.takeaway}</p></div>
          <div className="lesson-step-footer">
            <a href={lesson.source.url} target="_blank" rel="noopener noreferrer">{lesson.source.label} <span aria-hidden="true">↗</span></a>
          </div>
        </section>
        <CashuMath detailsRef={math} />
        <section className="lesson-details" aria-label="Cashu details and limits">
          <div className="lesson-bridge">
            <p className="eyebrow">NOW, BACK TO THE EVIDENCE</p>
            <h3>What the mint<br /><em>can still see.</em></h3>
            <p>On the desk, you try to connect a spent proof to its issuance. Several compatible sources mean the observations do not select one; they are not an anonymity percentage.</p>
            <p>The experiment assumes a closed cohort and no splitting or reissuance of the target proof. Real wallets can refresh and split proofs, so the desk’s simplified inference cannot be applied to arbitrary Cashu payments.</p>
          </div>
          <div className="lesson-reference">
            <details>
              <summary>Three words worth knowing</summary>
              <dl>
                <div><dt>Proof</dt><dd>A value, a secret, and the mint’s signature, identified by a keyset.</dd></div>
                <div><dt>Token</dt><dd>A portable package of proofs with mint information. Ordinary unlocked tokens work like bearer cash.</dd></div>
                <div><dt>Keyset</dt><dd>A family of mint signing keys for denominations. Its identifier is visible, not a wallet identity.</dd></div>
              </dl>
            </details>
            {cashuQuestions.map(item => <details key={item.title}><summary>{item.title}</summary><p>{item.answer}</p></details>)}
          </div>
        </section>
        <section className="lesson-check" aria-labelledby="cashu-check-title">
          <div><p className="eyebrow">CHECK YOUR INTUITION</p><h3 id="cashu-check-title">Someone sends you a token.<br />Could they still have a usable copy?</h3></div>
          <div className="lesson-check-answers">
            <button aria-pressed={answer === 'copy'} onClick={() => setAnswer('copy')}>No. A signature prevents copies.</button>
            <button aria-pressed={answer === 'refresh'} onClick={() => setAnswer('refresh')}>Yes. I need a successful refresh.</button>
            {answer && <p role="status">{answer === 'refresh' ? 'Exactly. ' : 'A signature proves validity, not uniqueness of a copy. '}The mint must consume the old proofs in a successful swap. The recipient then holds fresh proofs whose secrets the sender does not know.</p>}
          </div>
        </section>
        <footer className="lesson-footer">
          <div><strong>Return to your case.</strong><p>The guide is separate from your investigation. Your records and guess are unchanged.</p>
            <p className="lesson-sources">Primary sources: <a href="https://cashubtc.github.io/nuts/00/" target="_blank" rel="noopener noreferrer">Cashu NUTs</a> · <a href="https://cashubtc.github.io/nuts/23/" target="_blank" rel="noopener noreferrer">Lightning flow</a> · <a href="https://cashubtc.github.io/nuts/02/" target="_blank" rel="noopener noreferrer">Keysets & fees</a> · <a href="https://docs.cashu.space/faq" target="_blank" rel="noopener noreferrer">Trust & privacy FAQ</a></p>
          </div>
          <button className="primary-button" onClick={close}>Back to investigation <span aria-hidden="true">↗</span></button>
        </footer>
      </>}
    </dialog>
  </>;
}
