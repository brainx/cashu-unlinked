import { useEffect, useMemo, useRef, useState } from "react";
import type { ScenarioKind } from "../../src/contracts.js";
import {
  createRun,
  revealRun,
  availableCaptures,
  type RevealResponse,
} from "./api";
import {
  inferEvidence,
  observationView,
  type InvestigationEvidence,
  type DataMode,
} from "./model";
import { acts } from "./content";
import { EvidenceField } from "./components/EvidenceField";
import { Inspector } from "./components/Inspector";
import { GuessControls } from "./components/GuessControls";
import { RevealPanel } from "./components/RevealPanel";
import { TechnicalDrawer } from "./components/TechnicalDrawer";
import {buildExplanation} from "../../src/explanation.js";
import {NoteControls, PinnedComparison, type Assessments, type Assessment} from "./components/EvidenceNotes";
import {StorySummary, type Decision} from "./components/StorySummary";
import {useDeskSounds} from "./useDeskSounds";
import {CaseReceipt} from "./components/CaseReceipt";
import {CashuExplainer} from "./components/CashuExplainer";

type Phase =
  | "loading"
  | "ready"
  | "submitting"
  | "revealed"
  | "load-error"
  | "submit-error";

export default function App() {
  const [experience, setExperience] = useState<"story" | "challenge">("story");
  const [playing, setPlaying] = useState(false);
  const [round, setRound] = useState(1);
  const caseSequence = useRef(0);
  const chapterHeading = useRef<HTMLHeadingElement>(null);
  const focusAfterLoad = useRef(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const sounds = useDeskSounds();
  const [score, setScore] = useState({justified: 0, total: 0});
  const [pins, setPins] = useState<readonly string[]>([]);
  const [assessments, setAssessments] = useState<Assessments>({});
  const [step, setStep] = useState(0);
  const [decisions, setDecisions] = useState<Partial<Record<ScenarioKind, Decision>>>({});
  const [kind, setKind] = useState<ScenarioKind>("account-ledger");
  const [evidence, setEvidence] = useState<InvestigationEvidence | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [mode, setMode] = useState<DataMode>("synthetic");
  const [captures, setCaptures] = useState<readonly ScenarioKind[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [guess, setGuess] = useState<string | null>(null);
  const [result, setResult] = useState<RevealResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const submitted = useRef<string | null>(null);
  const submitting = useRef(false);
  const act = acts.find((item) => item.kind === kind)!;
  const actIndex = acts.indexOf(act);
  const inference = useMemo(
    () => (evidence ? inferEvidence(evidence) : null),
    [evidence],
  );
  const view = useMemo(
    () => (evidence ? observationView(evidence) : null),
    [evidence],
  );
  const effectiveMode = kind === "account-ledger" ? "synthetic" : mode;
  const steps = useMemo(() => evidence ? buildExplanation(evidence) : [], [evidence]);
  const activeStep = result ? steps[step] : undefined;
  const truthVisible = activeStep?.id === "truth";
  function changeStep(next: number) {
    const bounded = Math.max(0, Math.min(steps.length - 1, next));
    if (bounded !== step) sounds.play(steps[bounded]?.id === "truth" ? "stamp" : "paper");
    setStep(bounded);
  }
  function inspect(eventId: string | null) {
    setSelected(eventId);
    if (result) setInspectOpen(true);
    sounds.play();
  }
  function togglePin(id: string) {
    setPins(current => current.includes(id) ? current.filter(item => item !== id) : current.length < 2 ? [...current, id] : current);
  }
  function assess(id: string, value: Assessment) {
    if (phase === "ready") setAssessments(current => ({...current, [id]: value}));
  }

  async function begin(nextKind: ScenarioKind, nextMode: DataMode = mode, nextExperience = experience, options: {retry?: boolean; focus?: boolean} = {}) {
    const current = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    submitted.current = null;
    submitting.current = false;
    setKind(nextKind);
    setMode(nextMode);
    setExperience(nextExperience);
    if (nextExperience === "challenge" && !options.retry) setRound(++caseSequence.current);
    focusAfterLoad.current = options.focus !== false;
    setPhase("loading");
    setEvidence(null);
    setResult(null);
    setSelected(null);
    setGuess(null);
    setError("");
    setPins([]);
    setAssessments({});
    setStep(0);
    setInspectOpen(false);
    try {
      const next = await createRun(
        nextKind,
        controller.signal,
        nextKind === "account-ledger" ? "synthetic" : nextMode,
        nextExperience === "challenge",
      );
      if (current !== generation.current || controller.signal.aborted) return;
      setEvidence(next.evidence);
      setSessionId(next.sessionId);
      setPhase("ready");
    } catch (error) {
      if (current !== generation.current || controller.signal.aborted) return;
      setError(
        `Could not load this investigation. ${error instanceof Error ? error.message : "Try again."}`,
      );
      setPhase("load-error");
    }
  }

  useEffect(() => {
    void begin("account-ledger", "synthetic", "story", {focus: false});
    const captureRequest = new AbortController();
    void availableCaptures(captureRequest.signal)
      .then(setCaptures)
      .catch(() => {});
    return () => {
      ++generation.current;
      request.current?.abort();
      captureRequest.abort();
    };
  }, []);

  useEffect(() => {
    if (phase === "ready" && focusAfterLoad.current) {
      focusAfterLoad.current = false;
      chapterHeading.current?.focus({preventScroll: true});
      chapterHeading.current?.scrollIntoView({block: "start", behavior: "auto"});
    }
  }, [phase, evidence, playing]);

  async function reveal() {
    if (
      !evidence ||
      !guess ||
      submitting.current ||
      (phase !== "ready" && phase !== "submit-error")
    )
      return;
    const current = generation.current;
    const lockedGuess = submitted.current ?? guess;
    submitted.current = lockedGuess;
    submitting.current = true;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setPhase("submitting");
    setError("");
    try {
      const answer = await revealRun(
        evidence,
        lockedGuess,
        controller.signal,
        sessionId,
      );
      if (current !== generation.current || controller.signal.aborted) return;
      setResult(answer);
      setPhase("revealed");
      if (experience === "challenge") {
        setScore(previous => ({justified: previous.justified + Number(answer.verdict.evidenceSupported), total: previous.total + 1}));
      } else {
        setDecisions(previous => ({...previous, [kind]: {count: answer.verdict.candidateCount, supported: answer.verdict.evidenceSupported}}));
      }
    } catch (error) {
      if (current !== generation.current || controller.signal.aborted) return;
      setError(
        `Could not retrieve the reveal. ${error instanceof Error ? error.message : "Try again."} Your submitted guess is retained for a safe retry.`,
      );
      setPhase("submit-error");
    } finally {
      if (current === generation.current) submitting.current = false;
    }
  }

  return (
    <div className={`app-shell${playing ? " is-playing" : ""}${result ? " is-revealed" : ""}`}>
      <a className="skip-link" href="#investigation">
        Skip to investigation
      </a>
      <header className="masthead">
        <a className="wordmark" href="/" aria-label="UNLINKED home">
          <img src="/mark.svg" alt="" />
          <span>UNLINKED</span>
        </a>
        <span className="masthead-description">A CASHU PRIVACY EXPERIMENT</span>
        <div className="masthead-actions">
        <CashuExplainer />
        <a className="about-link" href="#method">
          About the experiment <span aria-hidden="true">↗</span>
        </a>
        </div>
      </header>
      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span className="short-rule" /> FOLLOW THE EVIDENCE.
            </div>
            <h1>
              You run the mint.
              <br />
              Can you <span>follow the money?</span>
            </h1>
            {!playing && <button className="enter-button" onClick={() => {focusAfterLoad.current = true; setPlaying(true);}}>Enter the investigation <span aria-hidden="true">↘</span></button>}
          </div>
          <div className="intro-aside">
            <span className="synthetic-label">
              <i />{" "}
              {evidence?.mode === "recorded-cashu"
                ? "RECORDED CASHU RUN"
                : effectiveMode === "recorded-cashu"
                  ? phase === "load-error"
                    ? "RECORDED RUN UNAVAILABLE"
                    : "LOADING RECORDED RUN"
                  : "SYNTHETIC MODEL"}
            </span>
            <p>
              A three-act investigation into what
              <br className="desktop-break" /> money reveals—and what it
              doesn’t.
            </p>
            <span className="intro-footnote">
              NO REAL FUNDS. JUST YOUR DEDUCTION.
            </span>
            {experience === "story" && <label className="data-source-control">
              Data source
              <select
                aria-label="Data source"
                value={effectiveMode}
                onChange={(event) => {
                  setPlaying(true);
                  const nextMode: DataMode =
                    event.target.value === "recorded-cashu"
                      ? "recorded-cashu"
                      : "synthetic";
                  void begin(
                    kind === "account-ledger" && nextMode === "recorded-cashu"
                      ? "cashu-blind"
                      : kind,
                    nextMode,
                  );
                }}
              >
                <option value="synthetic">Synthetic model</option>
                <option
                  value="recorded-cashu"
                  disabled={
                    !captures.includes(
                      kind === "account-ledger" ? "cashu-blind" : kind,
                    )
                  }
                >
                  Recorded Cashu run
                </option>
              </select>
            </label>}
          </div>
        </section>
        <div className="play-toolbar">
          <div className="experience-switch" role="group" aria-label="Experience">
            <button aria-pressed={experience === "story"} onClick={() => {
              if (experience !== "story") { setPlaying(true); void begin("account-ledger", "synthetic", "story"); }
            }}>Guided story</button>
            <button aria-pressed={experience === "challenge"} onClick={() => {
              if (experience !== "challenge") { setPlaying(true); void begin("cashu-denomination", "synthetic", "challenge"); }
            }}>Challenge mode</button>
          </div>
          <button className="sound-button" aria-label="Desk sounds" aria-pressed={sounds.enabled} disabled={sounds.pending} onClick={() => void sounds.toggle()}>
            <span aria-hidden="true">{sounds.enabled ? '♪' : '♩'}</span> Desk sounds <small>{sounds.enabled ? 'On' : 'Off'}</small>
          </button>
          {experience === "challenge" ? <span className="session-score">Justified conclusions: {score.justified} / {score.total}</span> :
            <span className="session-score">Three acts. Follow what the evidence permits.</span>}
        </div>
        {sounds.error && <p className="sound-error" role="status">{sounds.error}</p>}
        {experience === "story" && <nav className="act-navigation" aria-label="Investigation acts">
          {acts.map((item, index) => (
            <button
              key={item.kind}
              aria-label={`Act ${item.numeral}: ${item.label}`}
              aria-current={kind === item.kind ? "step" : undefined}
              onClick={() => {
                setPlaying(true);
                if (kind !== item.kind) void begin(item.kind);
              }}
            >
              <span className="act-number">0{index + 1}</span>
              <span>
                <small>ACT {item.numeral}</small>
                {item.label}
              </span>
              <span className="act-arrow" aria-hidden="true">
                ↗
              </span>
            </button>
          ))}
        </nav>}
        <section
          className="investigation"
          id="investigation"
          aria-busy={phase === "loading"}
        >
          <div className="chapter-heading">
            <div>
              <div className="eyebrow">
                {experience === "challenge" ? "INDEPENDENT INVESTIGATION" : `EXPERIMENT 0${actIndex + 1}`} <span>/</span> OBSERVE → INFER →
                REVEAL
              </div>
              <h2 ref={chapterHeading} tabIndex={-1}>{experience === "challenge" ? `Case ${String(round).padStart(2, "0")}` : act.title}</h2>
              <p>{experience === "challenge" ? "Twelve records. One spent proof. Decide whether the observations justify a unique source." : act.description}</p>
            </div>
            <button
              className="reset-button"
              onClick={() => void begin(kind, mode, experience)}
              disabled={phase === "loading"}
            >
              <span aria-hidden="true">↻</span>{" "}
              {experience === "challenge" ? "New case" : effectiveMode === "recorded-cashu" ? "Replay again" : "New run"}
            </button>
          </div>
          {phase === "load-error" ? (
            <div className="loading-panel">
              <p role="alert">{error}</p>
              <button
                className="primary-button"
                onClick={() => void begin(kind, mode, experience, {retry: true})}
              >
                Try again
              </button>
            </div>
          ) : !evidence || !view ? (
            <div className="loading-panel" role="status">
              <span className="loading-mark" aria-hidden="true">
                ∅
              </span>
              Preparing twelve issuance records…
            </div>
          ) : (
            <>
              {experience === "challenge" && <details className="hint-panel" key={evidence.runId}>
                <summary>Need a hint?</summary><p>Compare the target with every record. A source must match its denomination and have been issued no later than the spend. If several records survive both checks, the evidence does not justify choosing one.</p>
              </details>}
              <div className="investigation-layout">
                <div className="desk-column">
                <EvidenceField
                  key={evidence.runId}
                  evidence={view}
                  selected={selected}
                  guess={result ? null : guess}
                  source={truthVisible ? result?.verdict.sourceEventId : undefined}
                  mechanism={experience === "challenge" ? "Inspect · compare · make your call" : act.mechanism}
                  onInspect={inspect}
                  step={activeStep}
                  pins={pins}
                  assessments={assessments}
                  onShuffle={() => sounds.play()}
                />
                <PinnedComparison evidence={view} pins={pins} assessments={assessments} onPin={togglePin} />
                </div>
                <aside
                  className="inspector-panel"
                  aria-label="Evidence inspector"
                >
                  {result ? (
                    <><RevealPanel
                      evidence={view}
                      verdict={result.verdict}
                      guess={guess}
                      steps={steps}
                      step={step}
                      onStep={changeStep}
                      challenge={experience === "challenge"}
                      nextLabel={experience === "challenge" ? "Next case" : actIndex === 2 ? "Try a mixed case" : "Continue to next act"}
                      onNext={() => {
                        setPlaying(true);
                        if (experience === "challenge" || actIndex === 2) void begin("cashu-denomination", "synthetic", "challenge");
                        else void begin(acts[actIndex + 1]!.kind);
                      }}
                    />
                    {truthVisible && guess && <CaseReceipt evidence={evidence} verdict={result.verdict} guess={guess} />}
                    <details className="reveal-inspector" open={inspectOpen} onToggle={event => setInspectOpen(event.currentTarget.open)}>
                      <summary>Inspect selected record</summary>
                      <Inspector evidence={view} selected={selected} onChoose={setGuess} locked={true} readOnly />
                    </details></>
                  ) : (
                    <>
                      <Inspector
                        evidence={view}
                        selected={selected}
                        onChoose={setGuess}
                        locked={phase !== "ready"}
                      />
                      <NoteControls evidence={view} selected={selected} pins={pins}
                        assessment={selected ? assessments[selected] ?? "" : ""}
                        onPin={togglePin} onAssess={assess} locked={phase !== "ready"} />
                      <GuessControls
                        evidence={view}
                        guess={guess}
                        locked={phase !== "ready"}
                        submitting={phase === "submitting"}
                        retry={phase === "submit-error"}
                        onGuess={setGuess}
                        onReveal={() => void reveal()}
                      />
                      {error && (
                        <p className="submission-error" role="alert">
                          {error}
                        </p>
                      )}
                    </>
                  )}
                </aside>
              </div>
              {result && activeStep && <nav className="mobile-replay-bar" aria-label="Board replay controls">
                <a href="#evidence-board">View evidence <small>{step + 1} / {steps.length}</small></a>
                <button disabled={step === 0} aria-label="Previous board step" onClick={() => changeStep(step - 1)}>←</button>
                <button disabled={step === steps.length - 1} aria-label="Next board step" onClick={() => changeStep(step + 1)}>→</button>
              </nav>}
              <p className="scene-caption">
                <span aria-hidden="true">↳</span>{" "}
                {kind === "account-ledger"
                  ? "Reference model — deliberately linkable; not a representation of all payment networks."
                  : "Closed cohort. No splitting or reissuance. A compatible source is not a person, a probability, or a privacy score."}
              </p>
              {experience === "story" && actIndex === 2 && truthVisible && <StorySummary decisions={decisions} />}
              {inference && (
                <TechnicalDrawer evidence={evidence} inference={inference} showInference={experience === "story" || !!result} />
              )}
            </>
          )}
        </section>
      </main>
      <footer>
        <span>
          UNLINKED <span className="footer-divider">/</span> PRIVACY IS IN THE
          DETAILS.
        </span>
        <span>
          LOCAL EXPERIMENT <i className="footer-dot" /> FAKE VALUE ONLY
        </span>
      </footer>
    </div>
  );
}
