import type {Evidence, ModelAssumption, Observation, ScenarioKind} from './contracts.js';

const KINDS: readonly string[] = ['account-ledger', 'cashu-blind', 'cashu-denomination'];
const ASSUMPTIONS: readonly string[] = ['closed-cohort', 'no-split-or-reissue'];

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object`);
  }
  return value as Record<string, unknown>;
}
function allowedFields(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.includes(key)) {
      throw new TypeError(`Unknown field in ${label}: ${String(key)}`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.get || descriptor?.set) throw new TypeError(`${label} must contain data, not accessors`);
  }
}
function identifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value)) {
    throw new TypeError(`${label} must be a bounded identifier`);
  }
  return value;
}
function safeInteger(value: unknown, minimum: number, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${label} must be a safe integer >= ${minimum}`);
  }
  return value;
}
function observation(value: unknown, kind: ScenarioKind, label: string): Observation {
  const input = record(value, label);
  allowedFields(input, ['eventId', 'observedAtMs', 'amountSat', 'serial'], label);
  const eventId = identifier(input.eventId, `${label}.eventId`);
  if (eventId === 'insufficient-evidence') throw new TypeError(`${label}.eventId is reserved`);
  const observedAtMs = safeInteger(input.observedAtMs, 0, `${label}.observedAtMs`);
  const amountSat = safeInteger(input.amountSat, 1, `${label}.amountSat`);
  // BigInt avoids 32-bit truncation and logarithm rounding at large powers of two.
  const amount = BigInt(amountSat);
  if ((amount & (amount - 1n)) !== 0n) throw new TypeError(`${label}.amountSat must be a power of two`);
  if (kind === 'account-ledger') {
    return {eventId, observedAtMs, amountSat, serial: identifier(input.serial, `${label}.serial`)};
  }
  if (Object.hasOwn(input, 'serial')) throw new TypeError(`${label}.serial is not permitted in a Cashu scene`);
  return {eventId, observedAtMs, amountSat};
}

/** Project only explicit public fields. Unknown fields fail closed, including answer keys. */
export function parseEvidence(value: unknown): Evidence {
  const input = record(value, 'evidence');
  allowedFields(input, ['schemaVersion', 'mode', 'observer', 'runId', 'kind', 'assumptions', 'issuances', 'redemption'], 'evidence');
  if (input.schemaVersion !== 1) throw new TypeError('Unsupported schemaVersion');
  if (input.mode !== 'synthetic') throw new TypeError('Unsupported mode: foundation accepts synthetic only');
  if (input.observer !== 'mint') throw new TypeError('Unsupported observer');
  const runId = identifier(input.runId, 'runId');
  if (typeof input.kind !== 'string' || !KINDS.includes(input.kind)) throw new TypeError('Unsupported kind');
  const kind = input.kind as ScenarioKind;
  if (!Array.isArray(input.assumptions) || input.assumptions.length !== 2 ||
      new Set(input.assumptions).size !== 2 || !input.assumptions.every(a => ASSUMPTIONS.includes(a))) {
    throw new TypeError('assumptions must explicitly contain closed-cohort and no-split-or-reissue');
  }
  if (!Array.isArray(input.issuances) || input.issuances.length < 2 || input.issuances.length > 64) {
    throw new TypeError('issuances must contain between 2 and 64 events');
  }
  const issuances = input.issuances.map((item, index) => observation(item, kind, `issuances[${index}]`));
  const redemption = observation(input.redemption, kind, 'redemption');
  const ids = [...issuances.map(item => item.eventId), redemption.eventId];
  if (new Set(ids).size !== ids.length) throw new TypeError('Duplicate observation eventId');
  return {
    schemaVersion: 1, mode: 'synthetic', observer: 'mint', runId, kind,
    assumptions: [...input.assumptions] as ModelAssumption[], issuances, redemption,
  };
}
