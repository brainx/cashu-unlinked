# UNLINKED threat model

## Claim and protected boundary

UNLINKED asks which observed issuance batch could have produced one spent proof. Before a guess is submitted, the browser and observer receive only the allowlisted `Evidence` record. Ground truth stays in the loopback server's in-memory session store and reaches the evaluator only after submission.

The protected data is the source-to-spend answer mapping and private wallet material: mnemonics, seeds, token secrets, blinding factors, wallet identity, and internal runner state. Evidence parsing rejects unknown fields at the root and inside every observation. The browser build must not contain the scenario answer generator.

## Model assumptions

The initial inference assumes:

- a closed cohort containing every eligible issuance event;
- no splitting, reissuance, or recombination of the target proof;
- one controlled mint observer and the observations declared by the scene.

Act II retains equal denominations and relative times, leaving 12 compatible issuance events. Act III adds a rare denomination and leaves one compatible event under the same assumptions. These counts describe compatibility within the controlled model. They are not probabilities, anonymity percentages, universal privacy scores, or claims about people and merchants.

Challenge mode uses generated synthetic cohorts with 1, 2, 4, 8, or 12 compatible sources. Denomination mismatches and issuances after the target spend provide distinct elimination reasons. Public observations and ordering are fixed before the private source is chosen uniformly from compatible records. The public `POST /api/challenges` route accepts only `{}` and shares the guided session capacity, expiry, and reveal rules. The recipe cannot be selected through this route.

Challenge mode defers computed deductions in the interface until submission; it does not prevent visitors from calculating them from public evidence. Personal notes never change inference or the submitted answer. The step-by-step explanation accepts only validated observations. Ground truth appears at the final presentation step after submission, while the set of compatible sources remains unchanged.

## Observation handling

The reference scene is synthetic; both Cashu acts can use synthetic models or genuine recorded captures. Synthetic evidence retains event IDs, integer sat denominations, relative observation times, scenario kind, observer scope, and explicit assumptions. The deliberately linkable reference scene also retains a visible synthetic serial.

Recorded Cashu exports retain timestamps, amounts, keysets, grouping, requested blinded outputs, and fees. Spendable proof secrets and private wallet state are excluded. Such an export is a sanitized trace rather than the mint's complete raw view. Recorded labels require validated schema-v2 provenance and SHA-256 integrity. Replaying a file does not make a mint live. The enabled advertised NUT list reflects supported/enabled entries from mint info; NUT-03 is demonstrated by the actual recipient swap.

## Trust and limits

The mint is trusted to report its observations and provenance accurately. Wallet software and the capture runner are trusted to keep private material out of the observer projection. The local server is trusted to keep ground truth out of pre-reveal responses and static assets. Whoever controls the local machine can inspect process memory or modify code, so challenge secrecy is not guaranteed against that operator.

The parser and pure observer reduce accidental data leakage. They are an application boundary, not a hostile-code sandbox and not filesystem or process isolation. The loopback, same-origin API protects the local demonstration from ordinary cross-origin access; it is not a multi-user security boundary. A finite synthetic scene or recorded run is neither a cryptographic proof nor an audit of Cashu.

## Principal failure modes

- Private fields enter public evidence: fail closed through exact recursive schemas and serialized-payload tests.
- Ground truth changes inference: keep evaluation separate and test answer permutation against identical public evidence.
- Browser assets expose generation logic or answers: build from the public client graph, disable source maps, and scan the production artifact.
- Metadata is removed to force a preferred result: declare observer scope and revalidate inference against the complete sanitized observation set.
- Synthetic data is presented as protocol evidence: keep `SYNTHETIC MODEL` visible until a real fake-value capture passes its separate provenance gate.
- A stale private answer is paired with a newer capture after an interrupted export: require the answer's `runId` and `evidenceDigest` to match the verified evidence. Legacy unbound answers and mismatched pairs make the recording unavailable. This detects accidental pair mixing; it does not authenticate files against an operator who can modify both.

The native lab passed its fake-value integration gate with Nutshell 0.20.2 and cashu-ts 4.10.1. Each validation and export starts a fresh project-owned database and mint on loopback, preventing older issuance events from silently expanding the cohort. The mint environment excludes ambient mint, Cashu, and Lightning settings and uses an empty working directory to prevent `.env` loading. Mint processes and databases are removed afterward. Recorded files remain inspectable by the local machine owner; their minimal controlled answer files are kept outside static serving.
