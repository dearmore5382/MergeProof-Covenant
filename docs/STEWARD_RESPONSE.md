# Steward remediation — PR delta, challenge liveness and combined credits

The contract source in `contracts/MergeProofCovenant.py` addresses each requested path at the state-machine boundary.

## 1. Milestone assessment is bound to the actual PR changes

- GitHub's pull-files records are fetched for the sealed repository and submitted PR.
- Every selected production and regression-test artifact must have a non-empty PR `patch`.
- The adjudication prompt explicitly treats the patch as the work being assessed and the commit-pinned post-merge blob only as context.
- A file that exists after merge but has no available PR patch fails closed with `PR_PATCH_UNAVAILABLE`.
- Stored evidence includes patch SHA-256, blob SHA-256, file status, rename origin, and addition/deletion/change counts.

Focused test: `test_adjudication_evidence_is_bound_to_pr_patches`.

## 2. A challenge at the cutoff cannot lock the covenant

- New challenges remain prohibited at or after `challenge_end`.
- A challenge accepted before the cutoff can be re-adjudicated permissionlessly until `expires`, including after `challenge_end`.
- Resolution no longer routes through the initial-verification cutoff.
- Expiry recovery remains available if nobody resolves the challenge before expiry.

Focused test: `test_late_challenge_can_resolve_after_challenge_deadline`.

## 3. Same-address sponsor/contributor partial settlement conserves value

- Payout and refund components no longer overwrite each other when both map to the same address.
- The contract emits one `COMBINED` credit whose amount equals payout plus refund.
- `payout_amount` and `refund_amount` remain separate for authoritative accounting after the single native transfer is confirmed.
- The invariant remains `held + pending + paid + refunded == budget`.

Focused test: `test_same_address_partial_credit_is_combined_without_value_loss`.

## Verification

`npm run verify` passes Direct Mode contract tests, GenVM lint/schema validation, frontend tests, and the production build. The generated source digest and command outputs are recorded in `verification/LOCAL_VERIFICATION.json`.

The schema is bumped to `mergeproof-covenant-v2`; therefore, an earlier v1 deployment is not evidence for these corrections. A fresh StudioNet deployment and live evidence for all three paths are required before resubmission.
