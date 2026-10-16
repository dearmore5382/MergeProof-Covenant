# StudioNet E2E verification — active deployment

Contract: [`0xd689a42Ffffe5CD3A07f4bd0e938c7F221Dac024`](https://explorer-studio.genlayer.com/address/0xd689a42Ffffe5CD3A07f4bd0e938c7F221Dac024)

- Source SHA-256: `8ab2124316902f950f6446fa9e6272aeae3fc1d55b3daba3f5e9a02019dad921`
- Exact deployed-source parity: passed
- Sponsor: `0x736A168247e3f0C52F7907c9a8fDac572DF9c8bB`
- Contributor: `0xA63DE24e30C88FB1019E8956654730316e36eDBE`
- Deployer used for lifecycle testing: no
- Result: 49/49 checks passed; 20/20 transactions verified
- Final state: `SETTLED`, held `0`, pending `0`, paid `1000000000000000`, refunded `0`
- Bound merge SHA: `174ef5dfa9c4ea92171c7d00f562464519f9e008`

## Happy path and source adjudication

| Action | Finalized transaction |
| --- | --- |
| Create covenant | [`0x184c...452e`](https://explorer-studio.genlayer.com/transactions/0x184c6881aa35cc4da8f591ea6498f9913b86a921f15cb774b2c406ff734c452e) |
| Exact funding | [`0x1d69...52f6`](https://explorer-studio.genlayer.com/transactions/0x1d69668d6272d78ff2b0519659df2f16d104a3fe851ffacfb78742f47dff52f6) |
| Contributor submits merged PR | [`0xc824...4ade`](https://explorer-studio.genlayer.com/transactions/0xc8240d7b86d7a51ce6cc8d33c7bbf54f7297cbbfd6026548ab456733b29b4ade) |
| Verify commit-pinned artifacts (`SATISFIED`) | [`0x8365...ddc3`](https://explorer-studio.genlayer.com/transactions/0x83655dc1a5a725beafe392662e56e55c0fb9a53019f770c9cf18ed056ba1ddc3) |
| Challenge | [`0x8956...6de6`](https://explorer-studio.genlayer.com/transactions/0x8956105d0c6f456dafe2fdefcabcbe5a8c1ffc54100a2d761330530e12446de6) |
| Recheck from sources | [`0x0ae2...c5af`](https://explorer-studio.genlayer.com/transactions/0x0ae2ab09214cd3150b5fbb0ddbbfab2a0a91c2ec062588961d2f635c0f94c5af) |
| Finalize after challenge window | [`0x00f2...6dde`](https://explorer-studio.genlayer.com/transactions/0x00f2f531424195efc07081bd2f123468933d5dbdcd5604f2229f30182e006dde) |

## Native payout proof

| Evidence | Finalized transaction |
| --- | --- |
| Parent payout request | [`0x489f...0e02`](https://explorer-studio.genlayer.com/transactions/0x489fe2b40ca43466ded78bdadd9b30e90e740911363ec41849f51e0f093b0e02) |
| Canonical native transfer child | [`0x167b...7a6b`](https://explorer-studio.genlayer.com/transactions/0x167b8827ba9945137622af5ed5c6c0281a021f6b6bf6acba6420a86797e47a6b) |
| Receipt confirmation | [`0x7ba8...95b`](https://explorer-studio.genlayer.com/transactions/0x7ba8121d734343abb45015da47573db3413d8c764cf221567f2918ea017c095b) |

The contributor balance increased by exactly `1000000000000000` and the contract balance decreased by exactly the same amount. The credit moved from `TRANSFER_PENDING` to `PAID`, and authoritative accounting ended with `pending = 0` and `paid = 1000000000000000`.

## Adversarial and rollback evidence

| Scenario | Finalized transaction | Verified outcome |
| --- | --- | --- |
| Wrong wallet funding | [`0x139b...a118`](https://explorer-studio.genlayer.com/transactions/0x139b96e11b7a77a751092bf35c5c97c8dc10bc8231335c5ff08a44fcc9e2a118) | rejected; state unchanged |
| Underfund by one wei | [`0xc020...e81c`](https://explorer-studio.genlayer.com/transactions/0xc020ecbdc6a7bdd1cc127f59856d183f6b93086d7c2497cb471a3d90f946e81c) | rejected; state unchanged |
| Overfund by one wei | [`0x3369...ac44`](https://explorer-studio.genlayer.com/transactions/0x33694fa16fa0ee88c6e81beba172d34388a342e102703e1415c0f6e6866cac44) | rejected; state unchanged |
| Wrong submitter | [`0x3519...23eb`](https://explorer-studio.genlayer.com/transactions/0x3519320175a053c4b4a7925d28c0aaf3d22541185b869cb9264efd532ec123eb) | rejected; state unchanged |
| Second challenge | [`0xc085...85d3`](https://explorer-studio.genlayer.com/transactions/0xc085947d8408e6682f5c4cacdc69475ea228335fb9bdf33606b2445cca2485d3) | rejected; state unchanged |
| Early finalize | [`0x712a...e5d7`](https://explorer-studio.genlayer.com/transactions/0x712a4e09c7675b7c77ce3a9ff0ac4b16afc2aa2bf14cbeefb666cbdda746e5d7) | rejected; state unchanged |
| Payout replay | [`0x9a6b...7b0d`](https://explorer-studio.genlayer.com/transactions/0x9a6be90e67b13097786ab3de861e6fb2e14268db08d357e78fea2fa777087b0d) | rejected; state unchanged |
| Reused merge SHA | [`0x9e27...fce0`](https://explorer-studio.genlayer.com/transactions/0x9e272c7593fcb343d5ae65056940d5c623f342765c7b949fa697a570aa0efce0) | rejected; second covenant unchanged |

The complete receipts, pre/post authoritative states, consensus votes and balance observations are preserved in [`E2E_STUDIONET_21dac024.json`](./E2E_STUDIONET_21dac024.json). No private key is stored in either evidence file.
