# Threat model

| Threat | Enforcement |
|---|---|
| Self-authored completion report | Ignored; GitHub API facts are acquired by validators |
| Unmerged or wrong-base PR | Deterministic rejection inside source observation |
| Documentation-only claim | Required production and test path gates |
| Stale/wrong commit | Merge SHA is read from PR and checked against commit endpoint |
| Duplicate milestone | Repository + merge SHA single-use index |
| Wrong wallet funding/submission | Transaction sender binds sponsor/contributor |
| Wrong attached value | Exact payable equality |
| Verdict chooses arbitrary money | Fixed outcome-to-payout mapping |
| Infinite appeal | One challenge state and bounded deadline |
| Challenge filed immediately before cutoff | Re-adjudication remains permissionless until covenant expiry, including after `challenge_end` |
| Pre-existing post-merge code claimed as milestone work | Verdict is bound to GitHub's PR patches; post-merge blobs are context only |
| Sponsor and contributor are the same address | Payout and refund components are combined without overwriting and accounted separately |
| Held funds after disappearance | Permissionless expiry recovery credits sponsor |
| Transfer emission mistaken for payment | Pending state until canonical receipt confirmation |
| Receipt replay | Single-use child-receipt index |

Remaining assumptions: GitHub API availability/integrity, validator retrieval consistency, pinned GenLayer runner semantics and StudioNet canonical RPC correctness. Source failure is non-positive and preserves recovery.
