import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEvidence} from '../dist/validation.js';
import {inferCandidates} from '../dist/observer.js';
import {createSyntheticRun} from '../dist/scenarios.js';
import {evaluateGuess} from '../dist/evaluator.js';

function evidence(kind='cashu-blind') {
  const issuances = Array.from({length:12}, (_,i)=>({
    eventId:`issuance-${i+1}`, observedAtMs:1000+i*10, amountSat:8,
    ...(kind==='account-ledger' ? {serial:`visible-${i+1}`} : {})
  }));
  if(kind==='cashu-denomination') issuances[4].amountSat=64;
  return {schemaVersion:1,mode:'synthetic',observer:'mint',runId:'run-example',kind,
    assumptions:['closed-cohort','no-split-or-reissue'],issuances,
    redemption:{eventId:'spent-event',observedAtMs:5000,amountSat:kind==='cashu-denomination'?64:8,
      ...(kind==='account-ledger'?{serial:'visible-5'}:{})}};
}
function answer(e= evidence()) {return {runId:e.runId,redemptionEventId:e.redemption.eventId,sourceEventId:'issuance-5'};}

// Production mutations these tests catch: accepting private fields; dropping amount/time
// constraints; feeding answers into inference; reporting lucky guesses as supported.
test('valid evidence is projected to an independent object',()=>{
  const input=evidence(); const parsed=parseEvidence(input);
  assert.deepEqual(parsed,input); assert.notEqual(parsed,input);
  input.issuances[0].amountSat=128;
  assert.equal(parsed.issuances[0].amountSat,8);
});
test('linkable reference model finds the source by serial',()=>{
  const result=inferCandidates(evidence('account-ledger'));
  assert.deepEqual(result.candidateEventIds,['issuance-5']);
  assert.equal(result.strategy,'serial-equality');
});
test('equal denomination scene leaves twelve compatible sources',()=>{
  const result=inferCandidates(evidence());
  assert.equal(result.candidateEventIds.length,12);
  assert.equal(result.strategy,'denomination-and-time');
  assert.match(result.interpretation,/12 compatible issuance events/);
  assert.doesNotMatch(result.interpretation,/%|anonymous|guaranteed/);
});
test('rare denomination scene narrows the controlled cohort to one source',()=>{
  assert.deepEqual(inferCandidates(evidence('cashu-denomination')).candidateEventIds,['issuance-5']);
});
test('issuance after redemption is eliminated with a timing reason',()=>{
  const e=evidence(); e.issuances[0].observedAtMs=5001;
  const result=inferCandidates(e);
  assert.equal(result.candidateEventIds.length,11);
  assert.match(result.eliminated[0].reasons.join(' '),/after/);
});
test('zero compatible sources is not reported as attribution',()=>{
  const e=evidence();e.redemption.amountSat=16;
  const result=inferCandidates(e);
  assert.equal(result.candidateEventIds.length,0);
  assert.match(result.interpretation,/No compatible/);
});
test('root answer key is rejected instead of silently ignored',()=>{
  const e=evidence();assert.throws(()=>parseEvidence({...e,answerKey:answer(e)}),/Unknown field/);
});
test('nested private source field is rejected',()=>{
  const e=evidence();e.issuances[0].sourceEventId='hidden';
  assert.throws(()=>inferCandidates(e),/Unknown field/);
});
test('missing model assumption is rejected',()=>{
  const e=evidence();e.assumptions=['closed-cohort'];assert.throws(()=>parseEvidence(e),/assumptions/);
});
test('unknown model assumption is rejected',()=>{
  const e=evidence();e.assumptions.push('omniscient-observer');assert.throws(()=>parseEvidence(e),/assumptions/);
});
test('unsupported real mode cannot be applied to synthetic data',()=>{
  assert.throws(()=>parseEvidence({...evidence(),mode:'live-cashu'}),/mode/);
});
test('unknown scenario kind fails validation',()=>{
  assert.throws(()=>parseEvidence({...evidence(),kind:'unknown'}),/kind/);
});
test('missing run identifier is rejected',()=>{
  const e=evidence();delete e.runId;assert.throws(()=>parseEvidence(e),/runId/);
});
test('duplicate issuance identifiers are rejected',()=>{
  const e=evidence();e.issuances[1].eventId=e.issuances[0].eventId;
  assert.throws(()=>parseEvidence(e),/Duplicate/);
});
test('redemption cannot reuse an issuance identifier',()=>{
  const e=evidence();e.redemption.eventId=e.issuances[0].eventId;
  assert.throws(()=>parseEvidence(e),/Duplicate/);
});
test('serials cannot silently make a Cashu scene linkable',()=>{
  const e=evidence();e.redemption.serial='hidden-link';assert.throws(()=>parseEvidence(e),/serial/);
});
test('account model requires visible serials',()=>{
  const e=evidence('account-ledger');delete e.issuances[0].serial;
  assert.throws(()=>parseEvidence(e),/serial/);
});
for (const amount of [0,-1,1.5,3,Number.MAX_SAFE_INTEGER+1,NaN,Infinity]) {
  test(`invalid denomination ${amount} fails closed`,()=>{
    const e=evidence();e.issuances[0].amountSat=amount;
    assert.throws(()=>parseEvidence(e),/amountSat/);
  });
}
for (const timestamp of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) {
  test(`invalid timestamp ${timestamp} fails closed`,()=>{
    const e=evidence();e.redemption.observedAtMs=timestamp;
    assert.throws(()=>parseEvidence(e),/observedAtMs/);
  });
}
test('large safe power-of-two denomination is accepted without 32-bit truncation',()=>{
  const e=evidence();e.issuances[0].amountSat=2**40;e.redemption.amountSat=2**40;
  assert.deepEqual(inferCandidates(e).candidateEventIds,['issuance-1']);
});
test('source count bounds apply to input',()=>{
  const e=evidence();e.issuances=e.issuances.slice(0,1);assert.throws(()=>parseEvidence(e),/issuances/);
});
test('array instead of object is rejected',()=>assert.throws(()=>parseEvidence([]),/object/));
test('inference never mutates input',()=>{
  const e=evidence();const snapshot=structuredClone(e);inferCandidates(e);assert.deepEqual(e,snapshot);
});
test('private answer permutation cannot affect the public observer',()=>{
  const e=evidence();const first=answer(e);const second={...first,sourceEventId:'issuance-9'};
  const before=inferCandidates(e);
  assert.equal(evaluateGuess(e,first,'issuance-5').correct,true);
  assert.equal(evaluateGuess(e,second,'issuance-5').correct,false);
  assert.deepEqual(inferCandidates(e),before);
});
test('correct guess is not evidence-supported when twelve candidates remain',()=>{
  const e=evidence();const result=evaluateGuess(e,answer(e),'issuance-5');
  assert.equal(result.correct,true);assert.equal(result.evidenceSupported,false);
  assert.equal(result.candidateCount,12);assert.match(result.explanation,/not establish/);
});
test('insufficient-evidence answer is supported in the ambiguous model',()=>{
  const e=evidence();const result=evaluateGuess(e,answer(e),'insufficient-evidence');
  assert.equal(result.correct,true);assert.equal(result.evidenceSupported,true);
});
test('unique-source correct answer is supported under the model',()=>{
  const e=evidence('cashu-denomination');const result=evaluateGuess(e,answer(e),'issuance-5');
  assert.equal(result.correct,true);assert.equal(result.evidenceSupported,true);
});
test('insufficient-evidence answer is false when one source remains under assumptions',()=>{
  const e=evidence('cashu-denomination');assert.equal(evaluateGuess(e,answer(e),'insufficient-evidence').correct,false);
});
test('wrong source guess is not treated as evidence-supported',()=>{
  const e=evidence('cashu-denomination');const result=evaluateGuess(e,answer(e),'issuance-1');
  assert.equal(result.correct,false);assert.equal(result.evidenceSupported,false);
});
test('unknown guess is rejected',()=>{
  const e=evidence();assert.throws(()=>evaluateGuess(e,answer(e),'not-an-event'),/guess/);
});
test('answer key from another run is rejected',()=>{
  const e=evidence();assert.throws(()=>evaluateGuess(e,{...answer(e),runId:'other'},'issuance-5'),/Answer key/);
});
test('answer key for another redemption is rejected',()=>{
  const e=evidence();assert.throws(()=>evaluateGuess(e,{...answer(e),redemptionEventId:'other'},'issuance-5'),/Answer key/);
});
test('answer source inconsistent with observed model is rejected',()=>{
  const e=evidence('cashu-denomination');assert.throws(()=>evaluateGuess(e,{...answer(e),sourceEventId:'issuance-1'},'issuance-5'),/Answer key/);
});
for (const [kind,count] of [['account-ledger',1],['cashu-blind',12],['cashu-denomination',1]]) {
  test(`generator creates valid ${kind} scene without embedding answers`,()=>{
    const run=createSyntheticRun({kind});
    assert.equal(run.evidence.mode,'synthetic');
    assert.equal(run.evidence.issuances.length,12);
    assert.equal(inferCandidates(run.evidence).candidateEventIds.length,count);
    assert.equal(evaluateGuess(run.evidence,run.answerKey,run.answerKey.sourceEventId).correct,true);
    assert.doesNotMatch(JSON.stringify(run.evidence),/answerKey|sourceEventId|mnemonic|seed|secret|blinding/);
  });
}
test('synthetic generator enforces source count and scenario kind',()=>{
  for (const count of [1,65,12.5,NaN]) assert.throws(()=>createSyntheticRun({kind:'cashu-blind',candidateCount:count}),/candidateCount/);
  assert.throws(()=>createSyntheticRun({kind:'invalid'}),/kind/);
});
test('synthetic runs use distinct independent run identifiers',()=>{
  const a=createSyntheticRun({kind:'cashu-blind'});const b=createSyntheticRun({kind:'cashu-blind'});
  assert.notEqual(a.evidence.runId,b.evidence.runId);
  assert.notDeepEqual(a.evidence.issuances.map(x=>x.eventId),b.evidence.issuances.map(x=>x.eventId));
});
test('reserved guess sentinel cannot be used as an observation ID',()=>{
  const e=evidence();e.issuances[0].eventId='insufficient-evidence';
  assert.throws(()=>parseEvidence(e),/reserved/);
});
test('large nearly-power-of-two amount is rejected without logarithm rounding',()=>{
  const e=evidence();e.issuances[0].amountSat=2**52-1;
  assert.throws(()=>parseEvidence(e),/amountSat/);
});
test('accessor fields are rejected without executing them',()=>{
  const e=evidence();let accessed=false;
  Object.defineProperty(e,'runId',{enumerable:true,get(){accessed=true;return 'hidden';}});
  assert.throws(()=>parseEvidence(e),/accessors/);assert.equal(accessed,false);
});
test('symbol fields do not bypass the allowlist',()=>{
  const e=evidence();e[Symbol('answerKey')]=answer(e);
  assert.throws(()=>parseEvidence(e),/Unknown field/);
});
