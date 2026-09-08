# Hoodi transaction evidence — September 8, 2026

Three transactions were submitted through Lido Ethereum SDK 4.8.0 from the
isolated test account `0x7C0186eD3c66A392FCAA233893a807b265d99005` on Hoodi
(chain ID 560048). All three returned successful mined receipts, decoded SDK
results, and the expected token-balance changes.

| Operation | Input | Transaction | Mined block |
| --- | --- | --- | --- |
| Stake | 0.001 test ETH | [Receipt](https://hoodi.etherscan.io/tx/0xa29c272731173fbdc9f5240739c687243e2f2c5e844c230597340625c8c77a2f) | 3583032 |
| Wrap ETH | 0.001 test ETH | [Receipt](https://hoodi.etherscan.io/tx/0x0894a62ac764934d3b32987892b788dfeb53e5c9054a8f0f77df333d093f493f) | 3583035 |
| Request withdrawal with permit | 0.0005 stETH | [Receipt](https://hoodi.etherscan.io/tx/0xfaf4fccd4c866682ce5aaef6db045866486fbc9624ed4ed306455ea9ee7412bd) | 3583038 |

The [machine-readable report](hoodi-transactions-20260908.json) records receipt
block hashes, gas usage, decoded results, and before/after balances. Staking
increased the wallet's stETH shares from zero to `970093415024344`. Wrapping
increased its wstETH balance by `970093415024344` base units, matching the SDK's
decoded result. Withdrawal submission consumed `485046707512172` stETH shares
and created request **5019**, owned by the same wallet, for `500000000000000`
wei-denominated stETH.

At observation time, request 5019 was neither finalized nor claimed. This evidence
covers withdrawal submission only, not the full withdrawal-and-claim cycle. The
runner used local signing; browser wallet connection and confirmation UI were
not exercised. Receipts prove inclusion at the recorded blocks, not perpetual
testnet availability or independent consensus verification.

The report was generated from the working tree before the implementation was
committed; its `project.dirty` field deliberately remains `true`. `checkerDigest`
identifies the executed runner/policy files, and `lockfileDigest` identifies the
dependency lockfile. The report has not been relabeled as a clean-checkout run.
The tested runner was subsequently committed in
[`14c83f9`](https://github.com/GautamBytes/lido-sdk-example-checks/tree/14c83f9b6b27a0e03d96e8f4b7ad37ba4c3cad2b);
later changes to the runner do not alter this historical evidence.

See [transaction verification](../docs/transaction-verification.md) for the
bounded runner and instructions to reproduce using a separate test wallet.
