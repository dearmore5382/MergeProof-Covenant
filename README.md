# MergeProof Covenant

> Current StudioNet deployment uses schema `mergeproof-covenant-v2`: `0xC98759C893D0B515a4AB866aFA8a65C87E4ea648`. Live evidence covers PR patch binding, post-cutoff challenge resolution, combined same-address partial credits, and a separate finalized `MERGE_ALREADY_USED` duplicate-merge rejection. The original E2E report's three non-passing observations remain preserved; see [the live report](verification/E2E_STUDIONET_C98759.md), [focused replay evidence](verification/LIVE_REPLAY_CHECK_7e4ea648.json), and [steward response](docs/STEWARD_RESPONSE.md).

Live application: https://mergeproof-covenant.pages.dev/

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

The contract calls GitHub's API for the exact repository and PR, verifies merge state, base branch, full merge SHA and commit identity, and requires a patch for every selected production/test path. Validators assess work shown in those PR patches and use blobs fetched at the immutable merge SHA as context; missing patches fail closed. Source unavailability fails closed. See [source manifest](docs/TEST_RESOURCE_MANIFEST.md) and [threat model](docs/THREAT_MODEL.md).

## Local verification

```powershell
npm install --ignore-scripts
python -m pip install -r requirements-dev.txt
npm run verify
```

The gate runs Direct Mode against the submitted public contract methods, GenVM lint/schema validation, frontend unit tests and production build. Results and source SHA-256 are written to `verification/LOCAL_VERIFICATION.json`. Direct Mode mocks nondeterministic GitHub/LLM observations; it is not live consensus or StudioNet transfer proof.

## Deploy and live test

Active v2 StudioNet deployment: `0xC98759C893D0B515a4AB866aFA8a65C87E4ea648`. Source parity passed with SHA-256 `fe4098b53f343e613763d633c22388acfca883968f45eb01b13a3b2c44ca031a`. The original live report preserves its raw 92/95 result across 34 finalized transaction attempts. A separate focused retry confirms the single-use merge registry rejects reused PR #4 with `MERGE_ALREADY_USED` and no state mutation. Confirmed covenants include #1 (SATISFIED), #2 (PARTIAL same-address settlement), #3 (challenge accepted before cutoff, resolved after cutoff, then finalized), and #5 (duplicate merge rejected). See [the v2 live report](verification/E2E_STUDIONET_C98759.md), [original machine-readable receipts](verification/E2E_STUDIONET_7e4ea648.json), and [focused replay evidence](verification/LIVE_REPLAY_CHECK_7e4ea648.json).

Previous v1 StudioNet deployment: `0xd689a42Ffffe5CD3A07f4bd0e938c7F221Dac024`. Its archived source matched SHA-256 `8ab2124316902f950f6446fa9e6272aeae3fc1d55b3daba3f5e9a02019dad921`, and its two-wallet run completed 49 checks and 20 finalized transactions. That run predates the v2 steward remediation and is historical only. See `verification/E2E_STUDIONET_21dac024.md` and `verification/E2E_STUDIONET_21dac024.json`.

Address `0xa816CAe7E4c20ac44DE2d332b87775965076e533` proved source parity and the lifecycle through native payout, but its confirmation rejected StudioNet's canonical numeric finalized status and optional transfer type. The payout transferred correctly while authoritative accounting remained `TRANSFER_PENDING`; the run is retained as diagnostic evidence and is not presented as passing E2E evidence.

The prior address `0xd75259b7499AFa4A7Ebe79D383916F10FA0c2622` is also **SUPERSEDED**: its live `verify_merge` transaction safely failed without state mutation because the generic `strict_eq` validator could not be serialized by GenVM. The exact failure receipt is retained in `verification/LIVE_DIAGNOSTIC_OLD_CONTRACT.json`.

Deploy the current `contracts/MergeProofCovenant.py` with no constructor arguments using the main wallet, then configure two auxiliary wallets for lifecycle proof. Do not use the deployer for lifecycle proof.

The deployments `0x7c5e173E75CC5464b7a9ED5129a40637268071FB`, `0xd75259b7499AFa4A7Ebe79D383916F10FA0c2622`, and `0xa816CAe7E4c20ac44DE2d332b87775965076e533` are superseded and must not be submitted or used as passing E2E evidence.

- Wallet A: create/fund as sponsor.
- Wallet B: contributor submit plus independent challenge/recovery calls.

The reviewer may use any StudioNet wallet because no deployer allowlist exists. After deployment, set the address in the visible Active Contract field. Every frontend write waits for `FINALIZED`, checks leader execution, then re-reads authoritative state.

Required live evidence is specified in [E2E_PLAN.md](verification/E2E_PLAN.md). Never commit private keys, API tokens, wallet backups or `.env` files.

## Frontend

```powershell
npm run dev
```

The supplied logo is used in a repository-style merge dossier. The interface exposes contract address/network/Explorer, derives role actions from state and keeps creation separate from inspection. It opens on the current live replay-check covenant, links the finalized `MERGE_ALREADY_USED` transaction and evidence report, and re-reads contract state after a finalized rollback so the UI does not show stale state. It does not copy AuditCover's marketplace board.
