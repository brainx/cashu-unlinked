# Verification notes

The local software checks were run on 2026-09-12 with Node 22.23.1 and TypeScript 5.8.3. GitHub Actions runs the same software verification on Linux.

## Software checks

| Command | Coverage |
| --- | --- |
| `npm test` | Production builds; evidence validation and inference; synthetic and recorded APIs; receipt generation; teaching arithmetic; mint-runner isolation |
| `npm run typecheck` | Core, server, frontend, and lab |
| `npm run demo` | Synthetic candidate counts of 1 / 12 / 1 |
| `npm run test:browser` | Investigation, challenges, recorded playback, guide, math controls, errors, retries, keyboard navigation, reduced motion, and narrow/wide layouts |

`npm run verify` passed after the copy changes, including all 39 browser tests. Browser tests use a temporary server on port 3211 and stop it afterward. The 200% layout check uses a 720-CSS-pixel viewport with 2× scale; it does not operate browser zoom controls. Audio activation and failure handling are tested; physical speaker output has not been assessed.

The screenshots in [the README](../README.md#screenshots) show actual browser output. Synthetic cases are labelled separately from recorded Cashu playback.

## Cashu capture verification

The fake-value capture lab was verified separately on 2026-09-12 using cashu-ts 4.10.1 and native Nutshell 0.20.2/FakeWallet:

- `node lab/run-integration.mjs` completed both scenarios and exported the included recordings.
- `node lab/run-integration.mjs --verify-only` completed both scenarios again while preserving the four evidence/answer files byte for byte.
- Each scenario used a fresh mint process and disposable database, with twelve issuances and an actual recipient swap.
- Independent digest, fee, and inference checks matched both recordings. Compatible-source counts were 12 and 1; each swap charged a 1-sat input fee.
- Interrupting the capture runner stopped its mint and removed its temporary database while preserving prior completed fixtures.

The mint lab was not rerun for the copy and repository presentation pass. Its verified runtime was native Python; container behavior has not been tested. Ordinary playback needs neither Python nor a running mint.

## Interpretation

A recorded file is a sanitized trace. Its digest checks consistency, not authenticity. Saved recordings have a fixed cohort and answer; synthetic cases generate new answers. The answer files are inspectable in the repository and kept separate from the application’s pre-reveal responses.

Candidate counts depend on the stated closed-cohort and no-reissuance assumptions. They are not probabilities or universal privacy guarantees. The observer boundary prevents accidental disclosure inside the application; it does not isolate the answer from someone controlling the host machine.
