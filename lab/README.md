# Cashu capture lab

This lab records genuine Cashu mint and swap operations using fake value only. It
runs Nutshell on `127.0.0.1:3338` with its `FakeWallet` backend, creates twelve
independent issuance events, transfers one proof to a separate recipient wallet,
and records the recipient's NUT-03 swap. It never connects to Lightning or a
public mint.

The public files under `fixtures/recorded/` are labelled `recorded-cashu`. They
contain only mint-visible observations and explicit provenance. The adjacent
`.answer.json` files contain `sourceEventId` together with the exact capture's
`runId` and `evidenceDigest`; the server must keep them private until reveal and
reject stale or unbound answer files. Replaying a fixture is a **RECORDED CASHU RUN**.
It is not a live mint session.

## Pinned environment

- Node 22.16 or newer
- `@cashu/cashu-ts==4.10.1`
- Python 3.12
- `cashu==0.20.2`
- `limits==3.14.1` and `marshmallow==3.26.2`, compatibility pins needed by
  Nutshell 0.20.2

Nutshell 0.20.3 cannot currently resolve from PyPI because its declared
`breez-sdk-spark>=0.15,<0.16` dependency is unavailable there. Nutshell 0.20.2
was therefore selected after a clean `uv` resolution. The hashed lock contains
65 packages.

## Setup and capture

From the repository root:

```sh
uv venv --python 3.12 lab/.venv
UV_CACHE_DIR=lab/.uv-cache uv pip sync --python lab/.venv/bin/python lab/requirements.lock
npm install
node lab/run-integration.mjs
```

The last command is the only capture entry point. It fails if port 3338 is
occupied, compiles the typed lab, and runs each scenario against a new
project-owned Nutshell process and disposable database. Validation and fixture
export run in separate fresh mint processes. Readiness is bounded and
requires the process log to attest both the FakeWallet sat backend and the
loopback Uvicorn listener before any mint request. The process and database are
removed after each scenario, including failures.

Use `node lab/run-integration.mjs --verify-only` to run both fresh-mint validation
scenarios without exporting or replacing existing recorded files. The same
loopback, fake-value, readiness, and cleanup checks apply.

Each scenario is therefore a closed cohort with exactly twelve observed
issuances and no other issuance sources. The selected target is randomized for
each capture. The model additionally assumes that the target proof is not split
or reissued before its recorded redemption.

The strict shared parser rejects unknown fields at every level. Integrity is
SHA-256 over the browser-safe canonical JSON payload with recursively sorted
object keys and the root `integrity` field omitted. Public output retains event
times, amounts, keysets, request groups, blinded output requests, advertised
NUTs, SDK and mint versions, fee scope, and the observed input fee. Proofs,
secrets, quote IDs, wallet state, and target index remain in memory only. A
minimal answer bound to the public run and digest is saved separately for
server-side reveal and is never included in public evidence.

The blind recording has 12 compatible issuance events under the assumptions.
The denomination recording has one compatible issuance event. These are cohort
counts, not anonymity percentages and not links to people or merchants.

## Verified local result

On 2026-09-12, `node lab/run-integration.mjs` completed both isolated scenarios
against Nutshell 0.20.2/FakeWallet. A fresh process validated each scenario and
a second fresh process exported its public evidence plus private answer. Every
process recorded 12 genuine issuances and a recipient swap; the launcher stopped
each mint and deleted its database.

## Sources

- <https://github.com/cashubtc/cashu-ts/releases/tag/v4.10.1>
- <https://github.com/cashubtc/cashu-ts/blob/v4.10.1/src/wallet/Wallet.ts>
- <https://github.com/cashubtc/nutshell/releases/tag/0.20.2>
- <https://github.com/cashubtc/nutshell/blob/0.20.2/.env.example>
- <https://cashubtc.github.io/nuts/03/>
