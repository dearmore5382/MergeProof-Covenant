# StudioNet E2E evidence plan

No live transaction is claimed before deployment. Replace placeholders only with finalized observations.

## Identity

- Deployment wallet: deploy only.
- Auxiliary wallet A: sponsor.
- Auxiliary wallet B: contributor and adversarial caller.
- Contract address and deployed source SHA-256.

## Required scenarios

1. Happy path: create, exact fund, submit a real merged PR, verify, wait challenge boundary, finalize, request transfer, identify native child, confirm receipt and verify balances.
2. Wrong-role/wrong-value: unrelated funding, underfund by one wei, overfund by one wei and wrong contributor; record complete pre/post equality.
3. Poisoned evidence: real documentation-only PR and production-without-test PR must remain non-positive.
4. Conflict/challenge: challenge once, re-fetch exact authoritative facts, prohibit replay or late challenge.
5. Source failure: unavailable/malformed resource produces `SOURCE_UNAVAILABLE`, no credit.
6. Recovery: after expiry, an unrelated wallet triggers recovery but only sponsor receives refund credit.
7. Replay: reuse merge SHA, request payout twice and reuse child receipt; all rejected without mutation.
8. UI: each signed write finalizes, reports consensus/execution and re-reads the exact covenant ID.

For every transaction record expected result before sending, full hash, Explorer URL, signer, arguments/value, finality, consensus, leader execution and authoritative pre/post state. Store machine-readable JSON beside a single `E2E_FULL_REPORT.md`. Failed timing attempts remain labeled failures and are not counted as passes.
