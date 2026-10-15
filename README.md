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

The contract calls GitHub's API for the exact repository and PR, verifies merge state, base branch, full merge SHA, commit identity and changed paths. Validators evaluate actual path facts, not claimant prose. Source unavailability fails closed. See [source manifest](docs/TEST_RESOURCE_MANIFEST.md) and [threat model](docs/THREAT_MODEL.md).

## Local verification

```powershell
npm install --ignore-scripts
python -m pip install -r requirements-dev.txt
npm run verify
```

The gate runs Direct Mode against the submitted public contract methods, GenVM lint/schema validation, frontend unit tests and production build. Results and source SHA-256 are written to `verification/LOCAL_VERIFICATION.json`. Direct Mode mocks nondeterministic GitHub/LLM observations; it is not live consensus or StudioNet transfer proof.

## Deploy and live test

StudioNet deployment: `0x7c5e173E75CC5464b7a9ED5129a40637268071FB`. It was deployed from `contracts/MergeProofCovenant.py` with no constructor arguments using the main wallet. Do not use the deployer for lifecycle proof. Configure two auxiliary wallets:

- Wallet A: create/fund as sponsor.
- Wallet B: contributor submit plus independent challenge/recovery calls.

The reviewer may use any StudioNet wallet because no deployer allowlist exists. After deployment, set the address in the visible Active Contract field. Every frontend write waits for `FINALIZED`, checks leader execution, then re-reads authoritative state.

Required live evidence is specified in [E2E_PLAN.md](verification/E2E_PLAN.md). Never commit private keys, API tokens, wallet backups or `.env` files.

## Frontend

```powershell
npm run dev
```

The supplied logo is used in a repository-style merge dossier. The interface exposes contract address/network/Explorer, derives role actions from state and keeps creation separate from inspection. It does not copy AuditCover's marketplace board.
