# MergeProof Covenant — Submission Information

Use this file as the source for the project submission form and reviewer response.

## Project fields

- **Project title:** MergeProof Covenant — PR-Bound Milestone Escrow
- **One-liner:** Source-bound software milestone escrow that releases funds only after validators assess the actual merged pull request changes.
- **Suggested primary tag:** Developer Tools
- **Website:** https://mergeproof-covenant.pages.dev/
- **GitHub repository:** https://github.com/dearmore5382/MergeProof-Covenant/tree/evidence/live-replay-rejection
- **Active StudioNet contract:** `0xC98759C893D0B515a4AB866aFA8a65C87E4ea648`
- **Explorer:** https://explorer-studio.genlayer.com/address/0xC98759C893D0B515a4AB866aFA8a65C87E4ea648
- **Deployed schema:** `mergeproof-covenant-v2`
- **Deployed source SHA-256:** `fe4098b53f343e613763d633c22388acfca883968f45eb01b13a3b2c44ca031a`

## Project description

MergeProof Covenant is a GenLayer escrow for software delivery milestones. A sponsor seals a repository, base branch, contributor, acceptance criteria, deadline, and budget in an immutable covenant. After a pull request is merged, validators inspect GitHub-controlled PR metadata and the actual PR patches for required production and regression-test changes. Post-merge blobs at the immutable merge SHA are context only; they cannot substitute for work absent from the PR patch. The contract maps the bounded assessment to payout/refund credits, supports challenges and expiry recovery, prevents reuse of a merge SHA, and verifies native transfer receipts before marking credits paid. The deployer has no privileged operator role. Reviewers can inspect state without connecting a wallet and can use their own StudioNet wallet for permissionless actions allowed by the contract.

## Reviewer requests — implementation and verification, item by item

### 1. Bind milestone assessment to the actual PR changes, not only the merged repository snapshot

**What changed:** `contracts/MergeProofCovenant.py` fetches the selected PR's changed-file records and requires a non-empty GitHub `patch` for every relevant production and regression-test file. It rejects missing patches with `PR_PATCH_UNAVAILABLE`, bounds the amount of evidence it processes, and stores patch digests alongside the corresponding blob digests at the immutable merge SHA. The validator prompt explicitly says to judge implementation work shown in the PR patches; merged blobs provide context only and cannot earn credit for work absent from those patches. The assessment also requires both production and test paths, so documentation-only changes or filenames alone do not satisfy the evidence requirement.

**Focused test:** `test_adjudication_evidence_is_bound_to_pr_patches` checks that patch evidence and its digest are collected, then removes a required patch and asserts rejection with `PR_PATCH_UNAVAILABLE` even though post-merge blob context is available.

**Live proof:** PR #4's actual merged patch was assessed as `SATISFIED`; the contract recorded patch hashes for both the contract and regression-test file. See the [submit transaction](https://explorer-studio.genlayer.com/transactions/0x823a308f6be01a48759f325ab8fe7e8afe3fd6537b097995555c5c3734453e6e) and [patch/source verification transaction](https://explorer-studio.genlayer.com/transactions/0xd0cefe6320a11ab2dc41ed33e8775a6381b9d1cb0514f74a557f0f5811172b2e).

### 2. Do not let a late permissionless challenge lock the covenant past `challenge_end`

**What changed:** `challenge()` accepts a challenge only while the covenant is `VERIFIED` and current time is strictly before `challenge_end`; only one challenge can be opened. Once opened in time, `resolve_challenge()` has no caller-role restriction and remains callable after `challenge_end`, but only until `expires`. It re-runs the assessment and returns the covenant to `VERIFIED`, so normal finalization can proceed. If the resolution window itself expires, `recover_expired()` gives the sponsor a refund path; a challenge cannot keep funds locked indefinitely.

**Focused test:** `test_late_challenge_can_resolve_after_challenge_deadline` opens the challenge one second before the cutoff, resolves it one second after, and checks the resulting `VERIFIED` state. `test_challenge_is_single_bounded_recheck` also checks that a second challenge cannot be opened.

**Live proof:** Covenant #3's challenge transaction finalized before the cutoff; a permissionless resolution finalized after it, followed by successful settlement. See [challenge](https://explorer-studio.genlayer.com/transactions/0x1ddcc4bf6b5d3af47cca1eb7188318dea7d1c4171bab0d3c50a8747654a7b39f), [post-cutoff resolution](https://explorer-studio.genlayer.com/transactions/0x49f57cf16792c40f180af14f26a1d8a786c34ac2ed3132aee9843f0f7c076227), and [finalization](https://explorer-studio.genlayer.com/transactions/0x08eb9c246f03fdd1b06733cfc7ffb287e505efa4371e26bd6087499db413313a). A challenge first submitted after the cutoff is separately documented as rejected without state change in the detailed report.

### 3. Preserve all value when sponsor and contributor are the same address and the verdict is PARTIAL

**What changed:** Finalization creates address-keyed credits. When the sponsor and contributor are the same address, it merges the payout and refund into one `COMBINED` credit rather than overwriting one role's credit with the other's. The combined `amount` equals the full budget, while `payout_amount` and `refund_amount` remain separately recorded for accounting. The receipt-confirmation path increments `paid` and `refunded` by those separate components after proving the native transfer.

**Focused test:** `test_same_address_partial_credit_is_combined_without_value_loss` uses one address for both roles, obtains a `PARTIAL` verdict, and asserts one `COMBINED` credit totaling the full budget with the expected payout/refund split.

**Live proof:** Covenant #2 used the same sponsor/contributor address. The final `PARTIAL` settlement created a combined credit of `1000000000000000` base units, split evenly between payout and refund; the single native transfer was receipt-verified and final accounting showed `held=0`, `pending=0`, `paid=500000000000000`, `refunded=500000000000000`. See [finalize](https://explorer-studio.genlayer.com/transactions/0x11dcd761280c92d191f0a7c48a76b1241114235fe9645a4ae22cdaa2ed5f6fb2), [request combined payout](https://explorer-studio.genlayer.com/transactions/0xc24265bf099962debf3c6f22fd6200dc4725ad1a0d6039768d7537e9aa81c552), [native transfer](https://explorer-studio.genlayer.com/transactions/0xe4014aa382bb0c277751d37e734f1c4d248dcbcfe23c6d5a3c2daa6a34eb9596), and [receipt confirmation](https://explorer-studio.genlayer.com/transactions/0x06601a61a483d79c01f6066920230a1293abf13f746115420566b9bb86eb86ce).

### 4. Add focused tests and demonstrate all three lifecycle paths

The three requested regression tests are `test_adjudication_evidence_is_bound_to_pr_patches`, `test_late_challenge_can_resolve_after_challenge_deadline`, and `test_same_address_partial_credit_is_combined_without_value_loss`. Current local verification recorded 19/19 contract tests, 9/9 frontend tests, and a successful production build. The live transactions above demonstrate the corresponding paths on StudioNet. Separate adversarial live evidence also rejects reuse of an already-used merge SHA with `MERGE_ALREADY_USED` and no payout credit.

## “What did you change?” — paste this response

Addressed the steward's requests individually. First, milestone adjudication now requires and evaluates the actual GitHub PR patches for production and regression-test changes; the merge-SHA blobs are pinned context only, and missing required patches are rejected. Second, a permissionless challenge must be opened before `challenge_end`, but an already accepted challenge can be resolved after that cutoff until expiry, after which the sponsor has the expiry recovery path. Third, when sponsor and contributor are the same address, PARTIAL settlement produces one `COMBINED` credit whose total equals the budget while retaining separate payout/refund amounts and verifying the resulting native-transfer receipt. Added focused regression tests for each change. The sections below link to the test names, live StudioNet transactions, deployment/source identity, and frontend. The original E2E report remains 92/95; the later replay retry is recorded separately rather than rewriting the raw report.

## Reviewer path

1. Open https://mergeproof-covenant.pages.dev/ . If the browser has an older saved contract address, reload with **Ctrl+F5**; the frontend migrates known superseded addresses to the active v2 deployment.
2. The Dossier opens on covenant **#5**, the focused duplicate-merge replay check. Select **Sync state** to read authoritative StudioNet state. The replay verification finalized as a rollback with `MERGE_ALREADY_USED`; the covenant remains `PROOF_SUBMITTED` with no credits.
3. Open the contract explorer or the linked verification transaction below to confirm finality and the leader rollback payload. Read-only review does not require a wallet. Connect a StudioNet wallet only to submit an on-chain action.
4. For the other two requested contract paths, use the detailed E2E report and the linked challenge/partial-settlement transactions below.

## Focused live transaction evidence

### PR-patch-bound milestone assessment

PR #4 was assessed against its actual patch at merge SHA `efe559c098fb1e2393ca37404df0e9250962d07`; the live result was `SATISFIED`.

- Submit merged PR #4: https://explorer-studio.genlayer.com/transactions/0x823a308f6be01a48759f325ab8fe7e8afe3fd6537b097995555c5c3734453e6e
- Verify PR patches and source: https://explorer-studio.genlayer.com/transactions/0xd0cefe6320a11ab2dc41ed33e8775a6381b9d1cb0514f74a557f0f5811172b2e

On-chain patch SHA-256 values:

- `contracts/MergeProofCovenant.py`: `5921157614c99467670570b4878766711941e7b7c5acfa205668c6ffa04e7833`
- `tests/test_covenant.py`: `32685b9824bafa946926e45b35a5afe87fd4e9915cbd2100fcff55adbae46a7e`

### Challenge accepted before cutoff and resolved after cutoff

Covenant #3 accepted the challenge before `challenge_end`, permitted resolution afterward, then finalized to `SETTLED`.

- Verify PR #2: https://explorer-studio.genlayer.com/transactions/0xf1d1bf03c714eef3419f3c71ca7227d74cae79c5f463a3f5b0db0f1113c17370
- Challenge before cutoff: https://explorer-studio.genlayer.com/transactions/0x1ddcc4bf6b5d3af47cca1eb7188318dea7d1c4171bab0d3c50a8747654a7b39f
- Resolve after cutoff: https://explorer-studio.genlayer.com/transactions/0x49f57cf16792c40f180af14f26a1d8a786c34ac2ed3132aee9843f0f7c076227
- Finalize: https://explorer-studio.genlayer.com/transactions/0x08eb9c246f03fdd1b06733cfc7ffb287e505efa4371e26bd6087499db413313a

### Same-address PARTIAL credit conservation

Covenant #2 used one wallet as both sponsor and contributor. Finalization created a `COMBINED` credit of `1000000000000000` base units, split into `500000000000000` payout and `500000000000000` refund. The confirmed transfer left `held=0`, `pending=0`, `paid=500000000000000`, and `refunded=500000000000000`.

- Initial source-unavailable result: https://explorer-studio.genlayer.com/transactions/0xcfc29fb694d978a45f3767792b6a2c863e5ae9a83d850d0712025d3bb7dc3352
- Challenge transient failure: https://explorer-studio.genlayer.com/transactions/0x46bfd74b8f101cebf0412c55018151c6f0f012b6c7a0188ef1ab12e2e2e92978
- Recheck returned PARTIAL: https://explorer-studio.genlayer.com/transactions/0xb88079aa742d9125204f5ade68ef0c4b7cf80f3f29052d62be8c983fe78feb66
- Finalize PARTIAL: https://explorer-studio.genlayer.com/transactions/0x11dcd761280c92d191f0a7c48a76b1241114235fe9645a4ae22cdaa2ed5f6fb2
- Request combined payout: https://explorer-studio.genlayer.com/transactions/0xc24265bf099962debf3c6f22fd6200dc4725ad1a0d6039768d7537e9aa81c552
- Native child transfer: https://explorer-studio.genlayer.com/transactions/0xe4014aa382bb0c277751d37e734f1c4d248dcbcfe23c6d5a3c2daa6a34eb9596
- Confirm combined payout/refund: https://explorer-studio.genlayer.com/transactions/0x06601a61a483d79c01f6066920230a1293abf13f746115420566b9bb86eb86ce

### Duplicate merge replay rejection

Covenant #5 resubmitted already-used PR #4 with a one-wei budget. Verification finalized with leader execution `ERROR`, transaction result `rollback`, and payload `MERGE_ALREADY_USED`; state stayed `PROOF_SUBMITTED`, held escrow stayed one wei, and credits remained empty.

- Create covenant #5: https://explorer-studio.genlayer.com/transactions/0xe2584cdec79cd9d1cb1d5650b03f6f8c90ba5f566ebe9ddc02d591e9f7c66b6e
- Fund with one wei: https://explorer-studio.genlayer.com/transactions/0x0300dfe97796e61fe6ae0a02fdea7035b710245ef0363587a829bb89b6c41169
- Submit already-used PR #4: https://explorer-studio.genlayer.com/transactions/0x8db7bf315ee03745dcf1ed33074ca24e608479f807d1ffa9cc733874f0ffd6f0
- Verify rejects replay: https://explorer-studio.genlayer.com/transactions/0xa0857156e5aba634e7ff7f534623abb919b85706c738fce876630259565f436d

## Source, tests, and deployment evidence

- Detailed live report: https://github.com/dearmore5382/MergeProof-Covenant/blob/evidence/live-replay-rejection/verification/E2E_STUDIONET_C98759.md
- Original machine-readable E2E receipts (raw 92/95 preserved): https://github.com/dearmore5382/MergeProof-Covenant/blob/evidence/live-replay-rejection/verification/E2E_STUDIONET_7e4ea648.json
- Focused replay receipts: https://github.com/dearmore5382/MergeProof-Covenant/blob/evidence/live-replay-rejection/verification/LIVE_REPLAY_CHECK_7e4ea648.json
- Direct Mode test names: `test_adjudication_evidence_is_bound_to_pr_patches`, `test_late_challenge_can_resolve_after_challenge_deadline`, and `test_same_address_partial_credit_is_combined_without_value_loss`.
- Recorded local verification: 19/19 contract tests, GenVM lint/schema validation, and frontend production build passed. The latest frontend run separately passed 9/9 tests and production build; Cloudflare Pages returned HTTP 200 with the current v2 address and replay evidence in its bundle.

## Important accuracy note

The original live E2E report remains **92/95** and was not rewritten. It contains three raw non-passing observations, including transient source unavailability and a challenge attempt that finalized after its cutoff and was correctly rejected. The duplicate-merge live gap was later closed by the separate focused retry above. Do not describe the original run itself as 95/95.

The evidence and frontend changes are pushed to branch `evidence/live-replay-rejection`; they are **not yet merged into `main`**. Compare/create PR: https://github.com/dearmore5382/MergeProof-Covenant/compare/main...evidence/live-replay-rejection
