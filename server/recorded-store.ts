import {createHash, randomUUID, timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {Guess, Verdict} from '../src/contracts.js';
import type {CashuCaptureKind, RecordedCashuEvidence, RecordedRevealResult} from '../src/recorded-contracts.js';
import {canonicalRecordedPayload, inferRecordedCandidates, parseRecordedEvidence} from '../src/recorded.js';
import {SessionError} from './session-store.js';

export interface RecordedStore {
  available(): readonly CashuCaptureKind[];
  create(kind: CashuCaptureKind): {readonly sessionId: string; readonly evidence: RecordedCashuEvidence};
  reveal(sessionId: string, guess: Guess): RecordedRevealResult;
}

interface Capture {readonly evidence: RecordedCashuEvidence; readonly sourceEventId: string}
interface BoundAnswer {readonly runId: string; readonly evidenceDigest: string; readonly sourceEventId: string}
interface Session {readonly capture: Capture; readonly expiresAt: number; submission?: {readonly guess: Guess; readonly result: RecordedRevealResult}}
const KINDS: readonly CashuCaptureKind[] = ['cashu-blind','cashu-denomination'];

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

async function loadCapture(directory: string, kind: CashuCaptureKind): Promise<Capture | null> {
  try {
    const [evidenceText, answerText] = await Promise.all([
      readFile(resolve(directory, `${kind}.json`), 'utf8'), readFile(resolve(directory, `${kind}.answer.json`), 'utf8'),
    ]);
    const evidence = deepFreeze(parseRecordedEvidence(JSON.parse(evidenceText)));
    if (evidence.kind !== kind) throw new TypeError('Recorded fixture kind does not match its fixed path');
    const actual = createHash('sha256').update(canonicalRecordedPayload(evidence)).digest();
    const expected = Buffer.from(evidence.integrity.digest, 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new TypeError('Recorded evidence digest mismatch');
    const answer: unknown = JSON.parse(answerText);
    if (!answer || typeof answer !== 'object' || Array.isArray(answer) || Object.getPrototypeOf(answer) !== Object.prototype ||
        Object.keys(answer).length !== 3 || !['runId','evidenceDigest','sourceEventId'].every(key => Object.hasOwn(answer, key)) ||
        typeof (answer as Partial<BoundAnswer>).sourceEventId !== 'string') {
      throw new TypeError('Invalid private recorded answer');
    }
    const boundAnswer = answer as BoundAnswer;
    if (boundAnswer.runId !== evidence.runId || boundAnswer.evidenceDigest !== evidence.integrity.digest) {
      throw new TypeError('Private recorded answer does not match this capture');
    }
    const sourceEventId = boundAnswer.sourceEventId;
    if (!inferRecordedCandidates(evidence).candidateEventIds.includes(sourceEventId)) throw new TypeError('Private recorded answer is incompatible with public observations');
    return {evidence, sourceEventId};
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError ||
        (error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) return null;
    throw error;
  }
}

export async function loadRecordedStore(options: {fixturesDir: string; ttlMs: number; maxSessions: number; now: () => number}): Promise<RecordedStore> {
  if (!options || !Number.isSafeInteger(options.ttlMs) || options.ttlMs <= 0 || !Number.isSafeInteger(options.maxSessions) || options.maxSessions <= 0 || typeof options.now !== 'function') throw new TypeError('Recorded store options are invalid');
  const loaded = await Promise.all(KINDS.map(async kind => [kind, await loadCapture(options.fixturesDir, kind)] as const));
  const captures = new Map<CashuCaptureKind, Capture>(loaded.filter((item): item is readonly [CashuCaptureKind, Capture] => item[1] !== null));
  const sessions = new Map<string, Session>(); const expired = new Map<string, number>();
  function clean(now: number): void {
    for (const [id, session] of sessions) if (session.expiresAt <= now) {sessions.delete(id); expired.set(id, now + options.ttlMs);}
    for (const [id, until] of expired) if (until <= now) expired.delete(id);
    while (expired.size > options.maxSessions) expired.delete(expired.keys().next().value!);
  }
  return Object.freeze({
    available: () => KINDS.filter(kind => captures.has(kind)),
    create(kind: CashuCaptureKind) {
      const now = options.now(); clean(now);
      const capture = captures.get(kind);
      if (!capture) throw new SessionError(503, 'This recorded Cashu capture is unavailable');
      if (sessions.size >= options.maxSessions) throw new SessionError(429, 'Recorded session capacity reached');
      const sessionId = randomUUID(); sessions.set(sessionId, {capture, expiresAt:now + options.ttlMs});
      return {sessionId, evidence:deepFreeze(parseRecordedEvidence(capture.evidence))};
    },
    reveal(sessionId: string, guess: Guess): RecordedRevealResult {
      const now = options.now(); clean(now); const session = sessions.get(sessionId);
      if (!session) {if (expired.has(sessionId)) throw new SessionError(410, 'Recorded session expired'); throw new SessionError(404, 'Recorded session not found');}
      if (session.submission) {if (session.submission.guess !== guess) throw new SessionError(409, 'A different guess was already submitted'); return session.submission.result;}
      const inference = inferRecordedCandidates(session.capture.evidence);
      if (typeof guess !== 'string' || (guess !== 'insufficient-evidence' && !session.capture.evidence.issuances.some(item => item.eventId === guess))) throw new SessionError(400, 'Unknown guess');
      const count = inference.candidateEventIds.length; const abstain = guess === 'insufficient-evidence';
      const correct = abstain ? count > 1 : guess === session.capture.sourceEventId;
      const evidenceSupported = abstain ? count > 1 : correct && count === 1;
      const explanation = abstain
        ? count > 1 ? `${count} compatible issuance events remain in this recorded Cashu run; these observations do not establish a unique source.` : 'One compatible issuance event remains in this recorded Cashu run under the stated assumptions.'
        : correct && !evidenceSupported ? 'The guess matches the controlled recorded source, but these observations do not establish a unique source.'
        : correct ? 'The guess matches the only compatible source in this recorded Cashu run under the stated assumptions.'
        : 'The guess does not match the controlled recorded source. This result does not establish a general privacy guarantee.';
      const verdict: Verdict = {correct,evidenceSupported,candidateCount:count,sourceEventId:session.capture.sourceEventId,explanation};
      const result: RecordedRevealResult = deepFreeze({verdict,groundTruth:{label:'GROUND TRUTH',sourceEventId:session.capture.sourceEventId}});
      session.submission = {guess,result}; return result;
    },
  });
}
