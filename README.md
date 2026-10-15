# MergeProof Covenant

MergeProof is a GenLayer escrow for a single software milestone. It pays only after validators independently obtain GitHub-controlled PR, commit and changed-file facts and determine that the exact merged implementation satisfies sealed acceptance criteria.

It is not an auction and does not reuse AuditCover's bid, commit/reveal, coverage-matrix or bundle-selection architecture.

## Trust boundary

The contract proves a specific PR was merged into the locked repository/base branch, changed required production and test paths, and semantically addresses the sealed criteria. A README, screenshot or self-authored report cannot unlock payment. This release does **not** prove production deployment, vulnerability freedom, CI execution unless a future version verifies GitHub checks, or correctness in every runtime.

The deployer receives no role. The wallet calling `create_covenant` becomes sponsor; the contributor is sealed in immutable terms. Any wallet may verify, challenge or trigger expiry recovery when the state permits.

## Lifecycle

```text
DRAFT → FUNDED → PROOF_SUBMITTED → VERIFIED
                                  ├→ CHALLENGED → recheck
                                  └→ SETTLED → TRANSFER_PENDING → PAID/REFUNDED

funded nonterminal state after expiry → RECOVERED → sponsor refund
```

`SATISFIED`, `PARTIAL`, `INSUFFICIENT` and `SOURCE_UNAVAILABLE` are bounded verdicts. The contract—not the model—maps them to value. Exact funding is enforced and `held + pending + paid + refunded == budget`. Native transfer emission remains `TRANSFER_PENDING` until canonical finalized parent/child receipts prove the exact recipient, value and credited transfer. Receipts and merge SHAs are single-use.

## GitHub authority

The contract calls GitHub's API for the exact repository and PR, verifies merge state, base branch, full merge SHA and commit identity, then fetches every required production/test blob at that immutable SHA and recomputes its digest. Validators evaluate the actual bytes, not claimant prose or filenames. Source unavailability fails closed. See [source manifest](docs/TEST_RESOURCE_MANIFEST.md) and [threat model](docs/THREAT_MODEL.md).

## Local verification

```powershell
npm install --ignore-scripts
python -m pip install -r requirements-dev.txt
npm run verify
```

The gate runs Direct Mode against the submitted public contract methods, GenVM lint/schema validation, frontend unit tests and production build. Results and source SHA-256 are written to `verification/LOCAL_VERIFICATION.json`. Direct Mode mocks nondeterministic GitHub/LLM observations; it is not live consensus or StudioNet transfer proof.

## Deploy and live test

Replacement deployment is pending after a live StudioNet validator-serialization remediation. The prior address `0xd75259b7499AFa4A7Ebe79D383916F10FA0c2622` is **SUPERSEDED**: its live `verify_merge` transaction safely failed without state mutation because the generic `strict_eq` validator could not be serialized by GenVM. The exact failure receipt is retained in `verification/LIVE_DIAGNOSTIC_OLD_CONTRACT.json`; it is not presented as passing E2E evidence.

Deploy the current `contracts/MergeProofCovenant.py` with no constructor arguments using the main wallet, then configure two auxiliary wallets for lifecycle proof. Do not use the deployer for lifecycle proof.

The earlier deployments `0x7c5e173E75CC5464b7a9ED5129a40637268071FB` and `0xd75259b7499AFa4A7Ebe79D383916F10FA0c2622` are superseded and must not be submitted or used as passing E2E evidence.

- Wallet A: create/fund as sponsor.
- Wallet B: contributor submit plus independent challenge/recovery calls.

The reviewer may use any StudioNet wallet because no deployer allowlist exists. After deployment, set the address in the visible Active Contract field. Every frontend write waits for `FINALIZED`, checks leader execution, then re-reads authoritative state.

Required live evidence is specified in [E2E_PLAN.md](verification/E2E_PLAN.md). Never commit private keys, API tokens, wallet backups or `.env` files.

## Frontend

```powershell
npm run dev
```

The supplied logo is used in a repository-style merge dossier. The interface exposes contract address/network/Explorer, derives role actions from state and keeps creation separate from inspection. It does not copy AuditCover's marketplace board.
