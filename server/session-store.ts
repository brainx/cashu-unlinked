import type {Evidence, Guess, ScenarioKind, Verdict} from '../src/contracts.js';
import {evaluateGuess} from '../src/evaluator.js';
import {createSyntheticRun} from '../src/scenarios.js';
import {createSyntheticChallenge} from '../src/challenges.js';
import {parseEvidence} from '../src/validation.js';

export interface RevealResult {
  readonly verdict: Verdict;
  readonly groundTruth: {readonly label: 'GROUND TRUTH'; readonly sourceEventId: string};
}

export interface SessionStore {
  create(kind: ScenarioKind): Evidence;
  createChallenge(): Evidence;
  reveal(runId: string, guess: Guess): RevealResult;
}

export class SessionError extends Error {
  constructor(readonly statusCode: 400 | 404 | 409 | 410 | 413 | 429 | 503, message: string) {
    super(message);
    this.name = 'SessionError';
  }
}

interface Entry {
  readonly run: ReturnType<typeof createSyntheticRun>;
  readonly expiresAt: number;
  submission?: {readonly guess: Guess; readonly result: RevealResult};
}

export function createSessionStore(options: {ttlMs: number; maxSessions: number; now: () => number}): SessionStore {
  if (!options || !Number.isSafeInteger(options.ttlMs) || options.ttlMs <= 0 ||
      !Number.isSafeInteger(options.maxSessions) || options.maxSessions <= 0 || typeof options.now !== 'function') {
    throw new TypeError('Session store requires a positive integer ttlMs and maxSessions plus a clock');
  }
  const entries = new Map<string, Entry>();
  const expired = new Map<string, number>();

  function clean(now: number): void {
    for (const [runId, entry] of entries) {
      if (entry.expiresAt <= now) {
        entries.delete(runId);
        expired.set(runId, now + options.ttlMs);
      }
    }
    for (const [runId, forgetAt] of expired) if (forgetAt <= now) expired.delete(runId);
    while (expired.size > options.maxSessions) expired.delete(expired.keys().next().value!);
  }

  return Object.freeze({
    create(kind: ScenarioKind): Evidence {
      const now = options.now();
      clean(now);
      if (!['account-ledger', 'cashu-blind', 'cashu-denomination'].includes(kind)) {
        throw new SessionError(400, 'Unsupported challenge kind');
      }
      if (entries.size >= options.maxSessions) throw new SessionError(429, 'Session capacity reached');
      const run = createSyntheticRun({kind});
      entries.set(run.evidence.runId, {run, expiresAt: now + options.ttlMs});
      return parseEvidence(run.evidence);
    },
    createChallenge(): Evidence {
      const now = options.now();
      clean(now);
      if (entries.size >= options.maxSessions) throw new SessionError(429, 'Session capacity reached');
      const run = createSyntheticChallenge();
      entries.set(run.evidence.runId, {run, expiresAt: now + options.ttlMs});
      return parseEvidence(run.evidence);
    },
    reveal(runId: string, guess: Guess): RevealResult {
      const now = options.now();
      clean(now);
      const entry = entries.get(runId);
      if (!entry) {
        if (expired.has(runId)) throw new SessionError(410, 'Session expired');
        throw new SessionError(404, 'Session not found');
      }
      if (entry.submission) {
        if (entry.submission.guess !== guess) throw new SessionError(409, 'A different guess was already submitted');
        return entry.submission.result;
      }
      let verdict: Verdict;
      try {
        verdict = evaluateGuess(entry.run.evidence, entry.run.answerKey, guess);
      } catch (error) {
        if (error instanceof TypeError) throw new SessionError(400, error.message);
        throw error;
      }
      const result: RevealResult = Object.freeze({
        verdict: Object.freeze(verdict),
        groundTruth: Object.freeze({label: 'GROUND TRUTH', sourceEventId: verdict.sourceEventId}),
      });
      entry.submission = {guess, result};
      return result;
    },
  });
}
