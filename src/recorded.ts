import type {ModelAssumption} from './contracts.js';
import type {
  CashuCaptureKind, RecordedCashuEvidence, RecordedInference, RecordedIssuanceObservation,
  RecordedOutputObservation, RecordedRedemptionObservation,
} from './recorded-contracts.js';

const ROOT_FIELDS = ['schemaVersion','mode','observer','runId','kind','assumptions','observationScope','issuances','redemption','provenance','integrity'];

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be a plain object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object`);
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, fields: readonly string[], label: string): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !fields.includes(key)) throw new TypeError(`Unknown field in ${label}: ${String(key)}`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.get || descriptor?.set) throw new TypeError(`${label} must contain data, not accessors`);
  }
  if (Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field))) throw new TypeError(`${label} has missing fields`);
}
function text(value: unknown, label: string, maximum = 1000): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum) throw new TypeError(`${label} must be bounded text`);
  return value;
}
function identifier(value: unknown, label: string): string {
  const result = text(value, label, 128);
  if (!/^[A-Za-z0-9@][A-Za-z0-9@._:/+-]{0,127}$/.test(result)) throw new TypeError(`${label} must be a bounded identifier`);
  return result;
}
function integer(value: unknown, minimum: number, label: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a safe integer`);
  return value;
}
function amount(value: unknown, label: string): number {
  const result = integer(value, 1, label);
  const wide = BigInt(result);
  if ((wide & (wide - 1n)) !== 0n) throw new TypeError(`${label} must be a power of two`);
  return result;
}
function keysetId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{66}$/.test(value)) throw new TypeError(`${label} must be a compressed Cashu keyset identifier`);
  return value;
}
function output(value: unknown, label: string): RecordedOutputObservation {
  const input = record(value, label); exact(input, ['amountSat','keysetId','blindedMessage'], label);
  const blindedMessage = input.blindedMessage;
  if (typeof blindedMessage !== 'string' || !/^(02|03)[0-9a-f]{64}$/.test(blindedMessage)) throw new TypeError(`${label}.blindedMessage is invalid`);
  return {amountSat: amount(input.amountSat, `${label}.amountSat`), keysetId: keysetId(input.keysetId, `${label}.keysetId`), blindedMessage};
}
function outputs(value: unknown, label: string): readonly RecordedOutputObservation[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) throw new TypeError(`${label} must contain 1 to 64 outputs`);
  const result = value.map((item, index) => output(item, `${label}[${index}]`));
  if (new Set(result.map(item => item.blindedMessage)).size !== result.length) throw new TypeError(`${label} contains duplicate blinded messages`);
  return result;
}
function issuance(value: unknown, index: number): RecordedIssuanceObservation {
  const label = `issuances[${index}]`; const input = record(value, label);
  exact(input, ['eventId','observedAtMs','amountSat','keysetId','groupId','requestedOutputs'], label);
  const result: RecordedIssuanceObservation = {
    eventId: identifier(input.eventId, `${label}.eventId`), observedAtMs: integer(input.observedAtMs, 0, `${label}.observedAtMs`),
    amountSat: amount(input.amountSat, `${label}.amountSat`), keysetId: keysetId(input.keysetId, `${label}.keysetId`),
    groupId: identifier(input.groupId, `${label}.groupId`), requestedOutputs: outputs(input.requestedOutputs, `${label}.requestedOutputs`),
  };
  if (result.requestedOutputs.length !== 1 || result.requestedOutputs[0]!.amountSat !== result.amountSat || result.requestedOutputs[0]!.keysetId !== result.keysetId) {
    throw new TypeError(`${label} must describe one unsplit proof on its declared keyset`);
  }
  return result;
}
function redemption(value: unknown): RecordedRedemptionObservation {
  const input = record(value, 'redemption');
  exact(input, ['eventId','observedAtMs','inputAmountSat','inputFeeSat','inputs','groupId','requestedOutputs'], 'redemption');
  if (!Array.isArray(input.inputs) || input.inputs.length !== 1) throw new TypeError('redemption must spend exactly one target proof');
  const proof = record(input.inputs[0], 'redemption.inputs[0]'); exact(proof, ['amountSat','keysetId'], 'redemption.inputs[0]');
  const result: RecordedRedemptionObservation = {
    eventId: identifier(input.eventId, 'redemption.eventId'), observedAtMs: integer(input.observedAtMs, 0, 'redemption.observedAtMs'),
    inputAmountSat: amount(input.inputAmountSat, 'redemption.inputAmountSat'), inputFeeSat: integer(input.inputFeeSat, 0, 'redemption.inputFeeSat'),
    inputs: [{amountSat: amount(proof.amountSat, 'redemption.inputs[0].amountSat'), keysetId: keysetId(proof.keysetId, 'redemption.inputs[0].keysetId')}],
    groupId: identifier(input.groupId, 'redemption.groupId'), requestedOutputs: outputs(input.requestedOutputs, 'redemption.requestedOutputs'),
  };
  if (result.inputs[0]!.amountSat !== result.inputAmountSat) throw new TypeError('redemption input amount is inconsistent');
  const outputTotal = result.requestedOutputs.reduce((sum, item) => sum + item.amountSat, 0);
  if (!Number.isSafeInteger(outputTotal) || outputTotal + result.inputFeeSat !== result.inputAmountSat) throw new TypeError('redemption output amount and fee are inconsistent');
  return result;
}

/** Stable browser-safe encoding used as the SHA-256 integrity input. */
export function canonicalRecordedPayload(value: RecordedCashuEvidence): string {
  function normalize(input: unknown, root = false): unknown {
    if (Array.isArray(input)) return input.map(item => normalize(item));
    if (input !== null && typeof input === 'object') {
      const source = input as Record<string, unknown>; const target: Record<string, unknown> = {};
      for (const key of Object.keys(source).filter(key => !(root && key === 'integrity')).sort()) target[key] = normalize(source[key]);
      return target;
    }
    return input;
  }
  return JSON.stringify(normalize(value, true));
}

/** Strictly projects the public recorded schema. Digest bytes are verified by the caller. */
export function parseRecordedEvidence(value: unknown): RecordedCashuEvidence {
  const input = record(value, 'recorded evidence'); exact(input, ROOT_FIELDS, 'recorded evidence');
  if (input.schemaVersion !== 2 || input.mode !== 'recorded-cashu' || input.observer !== 'isolated-mint') throw new TypeError('Unsupported recorded Cashu evidence');
  if (input.kind !== 'cashu-blind' && input.kind !== 'cashu-denomination') throw new TypeError('Unsupported recorded Cashu kind');
  if (!Array.isArray(input.assumptions) || input.assumptions.length !== 2 || input.assumptions[0] !== 'closed-cohort' || input.assumptions[1] !== 'no-split-or-reissue') throw new TypeError('Recorded assumptions are invalid');
  if (!Array.isArray(input.issuances) || input.issuances.length !== 12) throw new TypeError('Recorded evidence requires 12 issuances');
  const issuances = input.issuances.map(issuance);
  const spent = redemption(input.redemption);
  const ids = [...issuances.map(item => item.eventId), spent.eventId];
  const groups = [...issuances.map(item => item.groupId), spent.groupId];
  if (new Set(ids).size !== ids.length || new Set(groups).size !== groups.length) throw new TypeError('Recorded event and group identifiers must be unique');
  if (issuances.some(item => item.observedAtMs > spent.observedAtMs)) throw new TypeError('Issuance cannot follow redemption');

  const provenance = record(input.provenance, 'provenance'); exact(provenance, ['captureVersion','sdk','mint','nuts','keysets','feeScope','source','recordedAtMs'], 'provenance');
  const sdk = record(provenance.sdk, 'provenance.sdk'); exact(sdk, ['name','version'], 'provenance.sdk');
  if (sdk.name !== '@cashu/cashu-ts' || sdk.version !== '4.10.1') throw new TypeError('Unsupported Cashu SDK provenance');
  const mint = record(provenance.mint, 'provenance.mint'); exact(mint, ['name','version','backend','unit'], 'provenance.mint');
  if (mint.name !== 'Nutshell' || mint.version !== '0.20.2' || mint.backend !== 'FakeWallet' || mint.unit !== 'sat') throw new TypeError('Unsupported mint provenance');
  if (!Array.isArray(provenance.nuts) || provenance.nuts.length < 1 || provenance.nuts.length > 64) throw new TypeError('Invalid NUT list');
  const nuts = provenance.nuts.map((nut, index) => integer(nut, 0, `provenance.nuts[${index}]`, 255));
  if (!nuts.includes(4) || new Set(nuts).size !== nuts.length || nuts.some((nut, index) => index > 0 && nut <= nuts[index - 1]!)) throw new TypeError('NUT list must be sorted, unique, and support issuance');
  if (!Array.isArray(provenance.keysets) || provenance.keysets.length < 1 || provenance.keysets.length > 16) throw new TypeError('Invalid provenance keysets');
  const keysets = provenance.keysets.map((item, index) => {
    const entry = record(item, `provenance.keysets[${index}]`); exact(entry, ['id','unit','inputFeePpk'], `provenance.keysets[${index}]`);
    if (entry.unit !== 'sat') throw new TypeError('Recorded keyset unit must be sat');
    return {id: keysetId(entry.id, `provenance.keysets[${index}].id`), unit: 'sat' as const, inputFeePpk: integer(entry.inputFeePpk, 0, `provenance.keysets[${index}].inputFeePpk`)};
  });
  const keysetMap = new Map(keysets.map(item => [item.id, item.inputFeePpk]));
  if (keysetMap.size !== keysets.length) throw new TypeError('Duplicate provenance keyset');
  const observedKeysets = [...issuances.flatMap(item => [item.keysetId, ...item.requestedOutputs.map(output => output.keysetId)]), ...spent.inputs.map(item => item.keysetId), ...spent.requestedOutputs.map(item => item.keysetId)];
  if (observedKeysets.some(id => !keysetMap.has(id))) throw new TypeError('Observation refers to an undeclared keyset');
  const expectedFee = Math.ceil(spent.inputs.reduce((sum, item) => sum + keysetMap.get(item.keysetId)!, 0) / 1000);
  if (spent.inputFeeSat !== expectedFee) throw new TypeError('Redemption fee is inconsistent with keyset input_fee_ppk');
  const recordedAtMs = integer(provenance.recordedAtMs, spent.observedAtMs, 'provenance.recordedAtMs');
  if (provenance.captureVersion !== 'unlinked-cashu-capture-v1' || provenance.source !== 'native-loopback-capture') throw new TypeError('Unsupported capture provenance');
  const integrity = record(input.integrity, 'integrity'); exact(integrity, ['algorithm','scope','digest'], 'integrity');
  if (integrity.algorithm !== 'sha256' || integrity.scope !== 'canonical-evidence-without-integrity' || typeof integrity.digest !== 'string' || !/^[0-9a-f]{64}$/.test(integrity.digest)) throw new TypeError('Invalid integrity metadata');
  return {
    schemaVersion: 2, mode: 'recorded-cashu', observer: 'isolated-mint', runId: identifier(input.runId, 'runId'), kind: input.kind as CashuCaptureKind,
    assumptions: ['closed-cohort','no-split-or-reissue'], observationScope: text(input.observationScope, 'observationScope'), issuances, redemption: spent,
    provenance: {captureVersion:'unlinked-cashu-capture-v1', sdk:{name:'@cashu/cashu-ts',version:'4.10.1'}, mint:{name:'Nutshell',version:'0.20.2',backend:'FakeWallet',unit:'sat'}, nuts, keysets, feeScope:text(provenance.feeScope,'provenance.feeScope'), source:'native-loopback-capture', recordedAtMs},
    integrity: {algorithm:'sha256',scope:'canonical-evidence-without-integrity',digest:integrity.digest},
  };
}

export function inferRecordedCandidates(value: unknown): RecordedInference {
  const evidence = parseRecordedEvidence(value);
  const target = evidence.redemption.inputs[0]!;
  const candidateEventIds: string[] = []; const eliminated: {eventId:string; reasons:string[]}[] = [];
  for (const item of evidence.issuances) {
    const reasons: string[] = [];
    if (item.observedAtMs > evidence.redemption.observedAtMs) reasons.push('Issuance occurred after the target redemption.');
    if (item.amountSat !== target.amountSat) reasons.push('Denomination differs from the single spent proof.');
    if (item.keysetId !== target.keysetId) reasons.push('Keyset differs from the single spent proof.');
    if (reasons.length) eliminated.push({eventId:item.eventId,reasons}); else candidateEventIds.push(item.eventId);
  }
  const count = candidateEventIds.length;
  return {strategy:'denomination-keyset-and-time', candidateEventIds, eliminated,
    assumptions:[...evidence.assumptions] as ModelAssumption[],
    interpretation: count === 1 ? '1 compatible issuance event in this recorded Cashu run under the stated assumptions.' : `${count} compatible issuance events in this recorded Cashu run under the stated assumptions; the observations do not select a unique source.`,
  };
}
