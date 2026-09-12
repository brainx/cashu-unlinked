import type {Evidence, Verdict} from './contracts.js';
import type {RecordedCashuEvidence} from './recorded-contracts.js';
import {parseEvidence} from './validation.js';
import {inferCandidates} from './observer.js';
import {canonicalRecordedPayload, inferRecordedCandidates, parseRecordedEvidence} from './recorded.js';

function parseVerdict(input: unknown): Verdict {
  const keys = ['correct', 'evidenceSupported', 'candidateCount', 'sourceEventId', 'explanation'];
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) ||
      Reflect.ownKeys(input).length !== keys.length ||
      Reflect.ownKeys(input).some(key => typeof key !== 'string' || !keys.includes(key) ||
        !Object.hasOwn(Object.getOwnPropertyDescriptor(input, key)!, 'value'))) {
    throw new TypeError('Receipt verdict must contain only the expected data fields');
  }
  const value = input as Record<string, unknown>;
  if (typeof value.correct !== 'boolean' || typeof value.evidenceSupported !== 'boolean' ||
      typeof value.candidateCount !== 'number' || !Number.isSafeInteger(value.candidateCount) ||
      typeof value.sourceEventId !== 'string' || typeof value.explanation !== 'string' || value.explanation.length > 2000) {
    throw new TypeError('Receipt verdict has invalid field values');
  }
  return {
    correct: value.correct,
    evidenceSupported: value.evidenceSupported,
    candidateCount: value.candidateCount,
    sourceEventId: value.sourceEventId,
    explanation: value.explanation,
  };
}

function xml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[character]!));
}

/** Post-reveal export only: project a validated result into a portable, trace-free receipt. */
export async function buildCaseReceiptSvg(input: unknown, result: unknown, guess: unknown): Promise<string> {
  const mode = input && typeof input === 'object' ? Object.getOwnPropertyDescriptor(input, 'mode')?.value : undefined;
  const evidence: Evidence | RecordedCashuEvidence = mode === 'recorded-cashu' ? parseRecordedEvidence(input) : parseEvidence(input);
  const verdict = parseVerdict(result);
  if (typeof guess !== 'string' || (guess !== 'insufficient-evidence' && !evidence.issuances.some(item => item.eventId === guess))) {
    throw new TypeError('Receipt guess is not a known conclusion');
  }
  const inference = evidence.mode === 'synthetic' ? inferCandidates(evidence) : inferRecordedCandidates(evidence);
  const count = inference.candidateEventIds.length;
  const correct = guess === 'insufficient-evidence' ? count > 1 : guess === verdict.sourceEventId;
  const supported = correct && (guess === 'insufficient-evidence' ? count > 1 : count === 1);
  if (count !== verdict.candidateCount || !inference.candidateEventIds.includes(verdict.sourceEventId) ||
      correct !== verdict.correct || supported !== verdict.evidenceSupported) {
    throw new TypeError('Receipt verdict does not match these observations and conclusion');
  }
  if (evidence.mode === 'recorded-cashu') {
    const bytes = new TextEncoder().encode(canonicalRecordedPayload(evidence));
    const digest = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)),
      byte => byte.toString(16).padStart(2, '0')).join('');
    if (digest !== evidence.integrity.digest) throw new TypeError('Receipt recording failed its integrity check');
  }

  const ordinal = (id: string) => String(evidence.issuances.findIndex(item => item.eventId === id) + 1).padStart(2, '0');
  const candidateLabel = `${count} compatible issuance ${count === 1 ? 'event' : 'events'}`;
  const status = supported ? 'JUSTIFIED' : correct ? 'LUCKY GUESS' : 'UNSUPPORTED';
  const conclusion = guess === 'insufficient-evidence' ? 'Insufficient evidence for a unique source' : `Issuance ${ordinal(guess)}`;
  const interpretation = supported
    ? 'Your conclusion follows from the evidence under the stated model.'
    : correct
      ? 'Matches the controlled source; the evidence does not select it.'
      : 'Your conclusion is not justified by these observations.';
  const modeLabel = evidence.mode === 'synthetic' ? 'SYNTHETIC MODEL' : 'RECORDED CASHU';
  const fragments: string[] = [];
  let y = 312;
  const text = (value: string, top: number, size = 16, fill = '#242720', weight = '400', x = 48, family = 'Arial, Helvetica, sans-serif') =>
    `<text x="${x}" y="${top}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}">${xml(value)}</text>`;
  const line = () => { fragments.push(`<path d="M 48 ${y} H 672" stroke="#cecaba" stroke-dasharray="4 5"/>`); y += 30; };
  const label = (value: string) => { fragments.push(text(value, y, 12, '#66695d', '600')); y += 27; };
  const row = (name: string, value: string) => {
    fragments.push(text(name, y, 14, '#66695d'), text(value, y, 16, '#242720', '400', 246));
    y += 32;
  };
  const paragraph = (value: string, size = 15, color = '#424939') => {
    const words = value.split(' ');
    let current = '';
    for (const word of words) {
      if (current.length + word.length + 1 > 76 && current) {
        fragments.push(text(current, y, size, color));
        y += 23;
        current = word;
      } else current += `${current ? ' ' : ''}${word}`;
    }
    if (current) { fragments.push(text(current, y, size, color)); y += 23; }
  };
  line();
  row('Your conclusion', conclusion);
  row('Controlled source', `Issuance ${ordinal(verdict.sourceEventId)}`);
  y += 5;
  paragraph(interpretation);
  paragraph('Knowing the controlled answer does not narrow the compatible set.');
  y += 12;
  label('Compatible sources');
  paragraph(inference.candidateEventIds.map(ordinal).join(', '), 17);
  y += 13;
  line();
  label('OBSERVATIONS & LIMITS');
  paragraph('Closed cohort: the source is among these observed issuances.');
  paragraph('No splitting or reissuance of the target proof before redemption.');
  paragraph('Candidate count is not a probability or privacy score.');
  paragraph('This experiment concerns issuance sources, not people or merchants.');
  y += 12;
  if (evidence.mode === 'recorded-cashu') {
    line();
    label('RECORDING PROVENANCE');
    row('Mint', `Nutshell ${evidence.provenance.mint.version} · FakeWallet`);
    row('SDK', `cashu-ts ${evidence.provenance.sdk.version}`);
    row('Captured at', new Date(evidence.provenance.recordedAtMs).toISOString());
    row('Input fee', `${evidence.redemption.inputFeeSat} sat (fake value)`);
    y += 6;
    paragraph('SHA-256 · canonical recording payload', 13);
    fragments.push(text(evidence.integrity.digest, y, 14, '#424939', '400', 48, 'Consolas, monospace'));
    y += 28;
    paragraph('Digest verifies consistency, not mint authenticity.', 13);
    paragraph('Recorded playback is not a live mint operation.', 13);
  } else {
    paragraph('Synthetic interaction model. No captured protocol trace.', 13);
  }
  y += 20;
  line();
  fragments.push(text('FOLLOW THE EVIDENCE. RESPECT ITS LIMITS.', y, 12, '#66695d', '600'));
  const height = y + 48;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${height}" viewBox="0 0 720 ${height}" role="img" aria-labelledby="receipt-title receipt-description">
<title id="receipt-title">UNLINKED case receipt · ${xml(candidateLabel)}</title>
<desc id="receipt-description">${xml(`${modeLabel}. Fake value only. ${status}. ${candidateLabel}. Candidate count is not a probability.`)}</desc>
<rect width="720" height="${height}" fill="#e1ded2"/>
<rect x="16" y="16" width="688" height="${height - 32}" fill="#f7f3e9" stroke="#c9c5b6"/>
${text('UNLINKED', 75, 29, '#242720', '700')}
${text('CASE RECEIPT / FAKE VALUE ONLY', 103, 12, '#66695d', '600')}
${text(modeLabel, 148, 13, '#66695d', '600')}
${text(String(count).padStart(2, '0'), 236, 86, '#242720', '400')}
${text(`compatible issuance ${count === 1 ? 'event' : 'events'}`, 277, 20)}
<g transform="rotate(-7 575 211)"><rect x="468" y="181" width="204" height="58" fill="none" stroke="#b94328" stroke-width="2"/><text x="570" y="217" text-anchor="middle" fill="#b94328" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700">${xml(status)}</text></g>
${fragments.join('\n')}
</svg>`;
}
