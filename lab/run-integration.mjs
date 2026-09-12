import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { buildMintEnvironment } from './mint-environment.mjs';

const arguments_ = process.argv.slice(2);
if (arguments_.length > 1 || (arguments_.length === 1 && arguments_[0] !== '--verify-only')) {
  throw new Error('Usage: node lab/run-integration.mjs [--verify-only]');
}
const verifyOnly = arguments_[0] === '--verify-only';
const projectRoot = resolve(import.meta.dirname, '..');
const mintExecutable = resolve(import.meta.dirname, '.venv/bin/mint');
const fixtureDirectory = resolve(projectRoot, 'fixtures/recorded');
const stagedDirectory = resolve(import.meta.dirname, 'data', `fixtures-${randomUUID()}`);
let activeMint;
let activeRunDirectory;
let activeSubprocess;

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function signalAndWait(child, signal, timeoutMs) {
  if (hasExited(child)) return Promise.resolve(true);
  return new Promise((resolvePromise) => {
    let settled = false;
    const finish = (exited) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off('exit', onExit);
      child.off('error', onError);
      resolvePromise(exited);
    };
    const onExit = () => finish(true);
    const onError = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once('exit', onExit);
    child.once('error', onError);
    child.kill(signal);
  });
}

async function terminateChild(child, signal = 'SIGTERM') {
  if (!child || hasExited(child)) return;
  if (await signalAndWait(child, signal, 3_000)) return;
  await signalAndWait(child, 'SIGKILL', 2_000);
}

async function assertPortFree() {
  await new Promise((resolvePromise, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error('127.0.0.1:3338 is already occupied')));
    probe.listen(3338, '127.0.0.1', () => probe.close(resolvePromise));
  });
}

function run(command, args, environment, timeoutMs = 60_000) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, env: environment, stdio: 'inherit' });
    activeSubprocess = child;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeSubprocess = undefined;
      if (error) reject(error); else resolvePromise();
    };
    const timer = setTimeout(async () => {
      await terminateChild(child);
      finish(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.once('error', (error) => finish(error));
    child.once('exit', (code, signal) => {
      if (code === 0) finish();
      else finish(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

async function waitForOwnedFakeMint(mint, log) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (hasExited(mint)) throw new Error('Mint exited during startup');
    try {
      const response = await fetch('http://127.0.0.1:3338/v1/info', {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) {
        if (!log().includes("Using FakeWallet backend for method: 'bolt11' and unit: 'sat'")) {
          throw new Error('Mint did not attest FakeWallet sat backend');
        }
        if (!log().includes('Uvicorn running on http://127.0.0.1:3338')) {
          throw new Error('Mint did not attest loopback listener');
        }
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Mint did not attest')) throw error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error('Mint readiness timed out');
}

async function stopMint(mint) {
  await terminateChild(mint, 'SIGINT');
}

async function withIsolatedMint(kind, action) {
  await assertPortFree();
  const runDirectory = resolve(import.meta.dirname, 'data', randomUUID());
  await mkdir(runDirectory, { recursive: false });
  activeRunDirectory = runDirectory;
  if ((await readdir(runDirectory)).length !== 0) {
    throw new Error('Fresh mint database directory is not empty');
  }
  const mintEnvironment = buildMintEnvironment(runDirectory);
  const mint = spawn(mintExecutable, ['--host', '127.0.0.1', '--port', '3338'], {
    cwd: runDirectory, env: mintEnvironment, stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeMint = mint;
  let spawnError;
  mint.once('error', (error) => { spawnError = error; });
  let startupLog = '';
  const appendLog = (chunk) => {
    startupLog = (startupLog + chunk).slice(-65_536);
  };
  mint.stdout.setEncoding('utf8');
  mint.stderr.setEncoding('utf8');
  mint.stdout.on('data', appendLog);
  mint.stderr.on('data', appendLog);
  try {
    if (spawnError) throw new Error('Unable to start project-owned mint');
    await waitForOwnedFakeMint(mint, () => startupLog);
    await action({
      ...process.env,
      UNLINKED_MINT_URL: 'http://127.0.0.1:3338',
      UNLINKED_MINT_PID: String(mint.pid),
      UNLINKED_MINT_BACKEND: 'FakeWallet',
      UNLINKED_CAPTURE_KIND: kind,
    });
  } finally {
    await stopMint(mint);
    activeMint = undefined;
    await rm(runDirectory, { recursive: true, force: true });
    activeRunDirectory = undefined;
  }
}

async function replaceKnownFixtures() {
  await mkdir(fixtureDirectory, { recursive: true });
  for (const kind of ['cashu-blind', 'cashu-denomination']) {
    for (const suffix of ['.json', '.answer.json']) {
      const name = `${kind}${suffix}`;
      await rename(resolve(stagedDirectory, name), resolve(fixtureDirectory, name));
    }
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    if (activeSubprocess) await terminateChild(activeSubprocess);
    if (activeMint) await stopMint(activeMint);
    if (activeRunDirectory) await rm(activeRunDirectory, { recursive: true, force: true });
    await rm(stagedDirectory, { recursive: true, force: true });
    process.exit(128 + (signal === 'SIGINT' ? 2 : 15));
  });
}

try {
  await assertPortFree();
  await run(resolve(projectRoot, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.lab.json'], process.env);
  await mkdir(resolve(import.meta.dirname, 'data'), { recursive: true });
  if (!verifyOnly) await mkdir(stagedDirectory, { recursive: true });
  for (const kind of ['cashu-blind', 'cashu-denomination']) {
    await withIsolatedMint(kind, (environment) =>
      run(process.execPath, ['--test', 'tests/lab/mint.integration.test.mjs'], environment));
    if (!verifyOnly) {
      await withIsolatedMint(kind, (environment) =>
        run(process.execPath, ['build/lab-project/lab/src/generate-fixtures.js', stagedDirectory, kind], environment));
    }
  }
  if (!verifyOnly) await replaceKnownFixtures();
} finally {
  if (activeMint) await stopMint(activeMint);
  if (activeSubprocess) await terminateChild(activeSubprocess);
  if (activeRunDirectory) await rm(activeRunDirectory, { recursive: true, force: true });
  await rm(stagedDirectory, { recursive: true, force: true });
}
