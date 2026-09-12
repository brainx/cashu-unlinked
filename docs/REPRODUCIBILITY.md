# Reproducing UNLINKED

## Browser experience

Use Node 22.16 or newer and the included `package-lock.json`:

```sh
npm ci --ignore-scripts
npm test
npm start
```

Visit `http://127.0.0.1:3210`. TypeScript 5.8.3 remains the pinned compiler baseline. The frontend uses React/React DOM 19.3.0 and Vite 8.3.0. The lab uses cashu-ts 4.10.1; it is never bundled into the browser.

The default reference act and synthetic Cashu acts generate independent source choices. The private answer stays in the session server. Each first submission locks the guess; identical retries return the retained result, while changed guesses return 409. Sessions expire after 20 minutes and each mode has a 128-session capacity. Expired tombstones are bounded.

Recorded mode loads the included fixed capture files, checks strict schema-v2 provenance and canonical SHA-256 integrity, and creates a new opaque challenge session. Each private answer must name the exact capture `runId` and `evidenceDigest`, preventing a stale answer from being paired with a different recording. Older answer files containing only `sourceEventId` fail closed and make that recording unavailable. The browser verifies the evidence digest independently. Replaying those files reproduces their observations and conclusions, not fresh cryptographic material. The separately stored controlled answer is revealed only after submission. A machine owner or someone reading the repository can inspect it; playback is not an adversarial secrecy benchmark.

## Verification commands

- `npm test`: core, observer boundary, synthetic API, recorded contract/API, teaching arithmetic, and production-artifact checks; includes all builds.
- `npm run typecheck`: separate strict TypeScript checks.
- `npm run demo`: synthetic candidate counts, expected 1 / 12 / 1.
- `npm run test:browser`: real browser interaction with the same-origin API, including errors, retries, stale responses, keyboard operation, reduced motion, narrow/wide layouts, and recorded provenance.

Playwright is pinned to 1.63.0. On a fresh machine, `npx playwright install chromium` installs its matching browser. `PLAYWRIGHT_EXECUTABLE_PATH` can select an existing compatible Chromium. Browser tests start their own server at `127.0.0.1:3211`; the normal preview at port 3210 is separate. `test-results/` contains ignored screenshots and failure traces. The zoom check emulates a 1440-pixel desktop at 200% with a 720-CSS-pixel viewport and 2× device scale; it is not a test of browser toolbar controls.

## Actual Cashu capture

See [lab/README.md](../lab/README.md) for the pinned Python environment and capture command. The reproducible native target is Nutshell 0.20.2 with FakeWallet, Python 3.12, and cashu-ts 4.10.1. New captures generate nondeterministic cryptographic material and random controlled source choices.

Each validation and export starts a separate fresh project-owned database and mint process, issues exactly twelve proofs, and spends one through an actual recipient swap. Exports pass the same strict capture/projection checks, with independently verified file digests and candidate counts. The runner stops its mint and removes its temporary mint data afterward. Public exports contain observations, grouping, blinded output requests, keysets, fees, versions, and provenance, never spendable proof secrets, seeds, or wallet state. `npm run test:lab` runs this capture gate and replaces only the four known recorded evidence/answer files after both exports complete.

To recheck both genuine fake-value scenarios while preserving the existing recorded files, run `node lab/run-integration.mjs --verify-only`. This starts a separate fresh mint for each scenario, validates the actual mint/swap operations, and removes the temporary mint databases without running the fixture exporter.

The recording digest uses recursively sorted JSON object keys, preserves array order, omits only the root `integrity` object, and hashes UTF-8 bytes with SHA-256. Its scope is file consistency; it does not attest that a trusted third party operated a mint.

No container service, global Python installation, public mint, real Lightning backend, or real funds is needed. Ordinary playback does not start a mint. An unavailable or invalid recording stays unavailable rather than silently becoming synthetic.
