# StudioNet v2 E2E report — 0xC987…a648

Contract: [0xC98759C893D0B515a4AB866aFA8a65C87E4ea648](https://explorer-studio.genlayer.com/address/0xC98759C893D0B515a4AB866aFA8a65C87E4ea648)  
Complete transaction and state record: [E2E_STUDIONET_7e4ea648.json](./E2E_STUDIONET_7e4ea648.json)  
Source SHA-256: `fe4098b53f343e613763d633c22388acfca883968f45eb01b13a3b2c44ca031a`  
Deployed source parity: passed; schema: `mergeproof-covenant-v2`  
Wallets: sponsor `0x736A168247e3f0C52F7907c9a8fDac572DF9c8bB`; contributor `0xA63DE24e30C88FB1019E8956654730316e36eDBE`. Deployer was not used for lifecycle testing.

The run recorded 34 finalized transaction attempts and 92/95 checks passed. This is a partial live report, not a claim that every scenario passed. Three raw check failures and their outcomes are listed below without rewriting the machine report.

## Requested remediation paths

### PR-change-bound adjudication

The live verifier assessed PR #4 at merge SHA `efe559c098fb1e2393ca37404dfd0e9250962d07` and returned `SATISFIED`. It recorded patch and post-merge blob digests for both the contract and regression-test paths.

| Action | Finalized transaction |
| --- | --- |
| Submit merged PR #4 | [0x823a…3e6e](https://explorer-studio.genlayer.com/transactions/0x823a308f6be01a48759f325ab8fe7e8afe3fd6537b097995555c5c3734453e6e) |
| Verify PR patches and source | [0xd0ce…2b2e](https://explorer-studio.genlayer.com/transactions/0xd0cefe6320a11ab2dc41ed33e8775a6381b9d1cb0514f74a557f0f5811172b2e) |

Patch SHA-256 values recorded onchain:

- `contracts/MergeProofCovenant.py`: `5921157614c99467670570b4878766711941e7b7c5acfa205668c6ffa04e7833`
- `tests/test_covenant.py`: `32685b9824bafa946926e45b35a5afe87fd4e9915cbd2100fcff55adbae46a7e`

### Late challenge resolution

Covenant #3 accepted a challenge before its deadline. The challenge was resolved after `challenge_end`, and the covenant then finalized to `SETTLED`.

| Action | Finalized transaction |
| --- | --- |
| Verify PR #2 | [0xf1d1…7370](https://explorer-studio.genlayer.com/transactions/0xf1d1bf03c714eef3419f3c71ca7227d74cae79c5f463a3f5b0db0f1113c17370) |
| Challenge before cutoff | [0x1ddc…39f](https://explorer-studio.genlayer.com/transactions/0x1ddcc4bf6b5d3af47cca1eb7188318dea7d1c4171bab0d3c50a8747654a7b39f) |
| Resolve after cutoff | [0x49f5…6227](https://explorer-studio.genlayer.com/transactions/0x49f57cf16792c40f180af14f26a1d8a786c34ac2ed3132aee9843f0f7c076227) |
| Finalize | [0x08eb…313a](https://explorer-studio.genlayer.com/transactions/0x08eb9c246f03fdd1b06733cfc7ffb287e505efa4371e26bd6087499db413313a) |

### Same-address PARTIAL settlement

Covenant #2 used the same wallet as sponsor and contributor. The initial source fetch returned `SOURCE_UNAVAILABLE` and created no credit. A permissionless challenge and subsequent source recheck returned `PARTIAL`. Finalization created one `COMBINED` credit for `1000000000000000` base units; the payout and refund components were each `500000000000000`.

The single confirmed native transfer left `held=0`, `pending=0`, `paid=500000000000000`, and `refunded=500000000000000`.

| Action | Finalized transaction |
| --- | --- |
| Initial source-unavailable result | [0xcfc2…3352](https://explorer-studio.genlayer.com/transactions/0xcfc29fb694d978a45f3767792b6a2c863e5ae9a83d850d0712025d3bb7dc3352) |
| Challenge transient failure | [0x46bf…2978](https://explorer-studio.genlayer.com/transactions/0x46bfd74b8f101cebf0412c55018151c6f0f012b6c7a0188ef1ab12e2e2e92978) |
| Recheck returned PARTIAL | [0xb880…eb66](https://explorer-studio.genlayer.com/transactions/0xb88079aa742d9125204f5ade68ef0c4b7cf80f3f29052d62be8c983fe78feb66) |
| Finalize PARTIAL | [0x11dc…6fb2](https://explorer-studio.genlayer.com/transactions/0x11dcd761280c92d191f0a7c48a76b1241114235fe9645a4ae22cdaa2ed5f6fb2) |
| Request combined payout | [0xc242…c552](https://explorer-studio.genlayer.com/transactions/0xc24265bf099962debf3c6f22fd6200dc4725ad1a0d6039768d7537e9aa81c552) |
| Native child transfer | [0xe401…9596](https://explorer-studio.genlayer.com/transactions/0xe4014aa382bb0c277751d37e734f1c4d248dcbcfe23c6d5a3c2daa6a34eb9596) |
| Confirm combined payout/refund | [0x0660…86ce](https://explorer-studio.genlayer.com/transactions/0x06601a61a483d79c01f6066920230a1293abf13f746115420566b9bb86eb86ce) |

## Other live outcomes and remaining gap

- A separate challenge submitted near the cutoff was finalized after the cutoff and correctly rejected with no state change. The earlier test expectation assumed it would arrive in time; the later dedicated covenant demonstrates the accepted-before-cutoff, resolved-after-cutoff path.
- Reusing a finalized merge reached a temporary GitHub `SOURCE_UNAVAILABLE` result. The contract created no payout credit, but this run did not obtain a live `MERGE_ALREADY_USED` rejection. Local Direct Mode covers the deterministic duplicate-merge rejection; a live retry is still needed for that specific case.
- Other checked cases include wrong wallet, underfund/overfund by one wei, wrong submitter, payout replay, exact native transfer receipts, and partial accounting conservation.

Local verification for the merged source: 19/19 Direct Mode contract tests, GenVM lint/schema validation, 8/8 frontend tests, and production build passed. The machine-readable live record remains unchanged and retains the three non-passing raw checks.
