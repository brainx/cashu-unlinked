import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

function execute(script, args) {
  return new Promise((resolve, reject) => {
    const environment = {...process.env};
    delete environment.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, [script instanceof URL ? fileURLToPath(script) : script, ...args], {env: environment, stdio: ['ignore', 'pipe', 'pipe']});
    const timer = setTimeout(() => child.kill('SIGTERM'), 10_000);
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); resolve({code, output}); });
  });
}

test('lab verification runs both isolated scenarios without exporting or replacing fixtures', {timeout: 15_000}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'unlinked-lab-runner-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  for (const directory of ['lab/.venv/bin', 'node_modules/.bin', 'tests/lab', 'build/lab-project/lab/src', 'fixtures/recorded']) {
    await mkdir(join(root, directory), {recursive: true});
  }
  for (const name of ['run-integration.mjs', 'mint-environment.mjs']) {
    await copyFile(new URL(`../lab/${name}`, import.meta.url), join(root, 'lab', name));
  }
  await writeFile(join(root, 'node_modules/.bin/tsc'), '#!/bin/sh\nexit 0\n', {mode: 0o755});
  await writeFile(join(root, 'lab/.venv/bin/mint'), `#!/usr/bin/env node
const {createServer} = require('node:http');
const server = createServer((request, response) => response.end('{}'));
server.listen(3338, '127.0.0.1', () => {
  console.log("Using FakeWallet backend for method: 'bolt11' and unit: 'sat'");
  console.log('Uvicorn running on http://127.0.0.1:3338');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
`, {mode: 0o755});
  await writeFile(join(root, 'tests/lab/mint.integration.test.mjs'), `
import {appendFile} from 'node:fs/promises';
await appendFile(new URL('../../validated.txt', import.meta.url), process.env.UNLINKED_CAPTURE_KIND + '\\n');
`);
  await writeFile(join(root, 'build/lab-project/lab/src/generate-fixtures.js'), 'throw new Error("Verification must not execute fixture export");\n');
  const fixtures = ['cashu-blind.json', 'cashu-blind.answer.json', 'cashu-denomination.json', 'cashu-denomination.answer.json'];
  for (const name of fixtures) await writeFile(join(root, 'fixtures/recorded', name), `preserve ${name}`);

  const result = await execute(join(root, 'lab/run-integration.mjs'), ['--verify-only']);
  assert.equal(result.code, 0, result.output);
  assert.deepEqual((await readFile(join(root, 'validated.txt'), 'utf8')).trim().split('\n'), ['cashu-blind', 'cashu-denomination']);
  for (const name of fixtures) assert.equal(await readFile(join(root, 'fixtures/recorded', name), 'utf8'), `preserve ${name}`);
  assert.deepEqual(await readdir(join(root, 'lab/data')), []);
});

test('lab runner rejects unknown arguments before starting processes', async () => {
  const result = await execute(new URL('../lab/run-integration.mjs', import.meta.url), ['--unsupported']);
  assert.notEqual(result.code, 0);
  assert.match(result.output, /Usage:.*--verify-only/);
});
