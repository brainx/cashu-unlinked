import {createSyntheticRun} from '../dist/scenarios.js';
import {inferCandidates} from '../dist/observer.js';
import {evaluateGuess} from '../dist/evaluator.js';

console.log('UNLINKED — SYNTHETIC MODEL ONLY; no mint, Lightning, or real funds.\n');
for (const kind of ['account-ledger','cashu-blind','cashu-denomination']) {
  const run=createSyntheticRun({kind});
  const inference=inferCandidates(run.evidence);
  const guess=kind==='cashu-blind'?'insufficient-evidence':inference.candidateEventIds[0];
  const verdict=evaluateGuess(run.evidence,run.answerKey,guess);
  console.log(`${kind}: ${inference.candidateEventIds.length} compatible source(s)`);
  console.log(`  ${verdict.explanation}`);
}
console.log('\nCounts depend on the declared model; they are not anonymity probabilities.');
