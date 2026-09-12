import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

import { projectCapture, runCashuCapture, writeRecordedEvidence } from './capture.js';

const mintUrl = 'http://127.0.0.1:3338';
const outputDir = resolve(process.argv[2] ?? 'fixtures/recorded');
const kind = process.argv[3];
if (kind !== 'cashu-blind' && kind !== 'cashu-denomination') {
  throw new Error('Expected cashu-blind or cashu-denomination');
}
const filename = `${kind}.json`;

const capture = await runCashuCapture(kind, { mintUrl });
const evidence = projectCapture(capture);
await writeRecordedEvidence(resolve(outputDir, filename), evidence);
await writeFile(
  resolve(outputDir, filename.replace('.json', '.answer.json')),
  `${JSON.stringify({ runId: evidence.runId, evidenceDigest: evidence.integrity.digest, sourceEventId: capture.sourceEventId }, null, 2)}\n`,
  { encoding: 'utf8', flag: 'wx' },
);
console.log(`${kind}: ${evidence.integrity.digest}`);
