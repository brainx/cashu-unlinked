import { acts } from "../content";
import type { ScenarioKind } from "../../../src/contracts.js";

export interface Decision { readonly count: number; readonly supported: boolean; }
export function StorySummary({decisions}: {decisions: Partial<Record<ScenarioKind, Decision>>}) {
  return <section className="story-summary" aria-label="Your investigation so far">
    <div className="eyebrow">YOUR INVESTIGATION SO FAR</div>
    <h3>What the evidence could establish.</h3>
    <div className="story-decisions">{acts.map(act => {
      const decision = decisions[act.kind];
      return <article key={act.kind}>
        <span className="eyebrow">ACT {act.numeral}</span><h4>{act.label}</h4>
        <p>{decision ? `${decision.count} compatible ${decision.count === 1 ? "source" : "sources"}` : "Not completed"}</p>
        <small>{decision ? decision.supported ? "Your conclusion was justified." : "Your conclusion was not justified." : "Return to this act to investigate."}</small>
      </article>;
    })}</div>
    <p>The next case combines denomination and timing clues. Decide what the observations can justify.</p>
  </section>;
}
