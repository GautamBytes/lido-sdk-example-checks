# Hoodi transaction verification

The opt-in transaction runner calls the real SDK to stake 0.001 Hoodi ETH, wrap
0.001 Hoodi ETH, and request withdrawal of 0.0005 stETH using a permit. It verifies
mined receipts, decoded SDK results, stETH share changes, wstETH balance changes,
and the newly created withdrawal request's owner and amount.

## Run with an isolated test wallet

Use a dedicated Hoodi EOA with at least 0.035 test ETH, allowing for conservative
gas caps. Keep its key in an owner-only file outside this repository, with mode
`600`. Never put a key in command arguments, reports, screenshots, or Git. The
runner does not create wallets or obtain faucet funds.

```sh
# This variable is a file path, not a private key.
export HOODI_WALLET_FILE=/absolute/path/outside/the/repository/test-key

# Read-only preflight: verifies the network, deployment, balance and EOA.
npm run check:transactions -- --output reports/preflight.json

# Explicitly sign and broadcast the three bounded testnet transactions.
npm run check:transactions -- --execute --output reports/transactions.json
```

`HOODI_RPC_URL` optionally selects another HTTP(S) provider; the default is the
public ethPandaOps Hoodi RPC. No transaction test runs in CI or `npm test`.
The ordinary offline suite tests transaction restrictions and receipt validation.

Before signing, the runner checks chain ID `560048`, reviewed contract addresses,
the method/calldata, exact payable values, and withdrawal receiver. It caps each
transaction at 1,000,000 gas and 10 gwei max fee per gas. The permit is limited to
the withdrawal queue, 0.0005 stETH, and a short deadline. The three transactions'
combined principal is 0.002 test ETH; their conservative maximum gas allowance
is 0.03 test ETH. Unused funds and tokens stay in the test wallet.

The SDK receives a guarded local account through its wallet client. These checks
exercise the same SDK transaction methods used by the Markdown examples. They
do not test browser wallet prompts or the EIP-1193 connection flow in those
examples. A local account object must be retained: passing only its address to
the SDK would select JSON-RPC account behavior instead of local signing.

## Evidence and interruptions

JSON records the account, SDK version, project commit/dirty flag, checker and
lockfile digests, transaction hashes, receipt blocks/gas, decoded results, and
before/after token balances. Reports contain no private keys, permit signatures,
raw signed transactions, or provider URLs. A signed transaction's hash is saved
before broadcast; the journal is updated after broadcast and receipt validation.

An existing output file is never overwritten by a new run. After an interrupted
run, inspect each recorded `signedHash`/`hash` on Hoodi before taking further
action. A network error does not prove the transaction was rejected. The runner
does not automatically resend transactions or resume partially completed flows.
Choose a new output path only when intentionally starting another test flow.

`preflight-passed` means no transaction was sent. `passed` in execution mode
requires all three transactions and their postconditions to pass. A failure
preserves prior results and any known pending hashes, and exits nonzero.

## Withdrawal scope

Successful withdrawal **submission** creates a request; it does not demonstrate
the later claim. The report records the request ID and marks the claim as
`awaiting-finalization` or `ready-not-tested`. Finalization is controlled by the
protocol. Do not present these three transactions as a completed
withdrawal-and-claim cycle.

## Claim an existing test request

Pass the original successful transaction report to select its request and wallet.
Claim mode never repeats staking, wrapping, or withdrawal submission.

```sh
# Readiness check only; use the same HOODI_WALLET_FILE as the original run.
npm run check:transactions -- \
  --claim-report evidence/hoodi-transactions-20260908.json \
  --output reports/claim-preflight.json

# Claim only if finalized, unclaimed, and still owned by this wallet.
npm run check:transactions -- --execute \
  --claim-report evidence/hoodi-transactions-20260908.json \
  --output reports/claim-result.json
```

Claim mode checks the source report's network, owner, request ID, and amount
against current on-chain state. It needs at least 0.011 test ETH as a conservative
gas reserve. It signs only `claimWithdrawals` for that one request on the reviewed
Hoodi queue, with zero ETH value and the same gas/fee caps as the other tests.
The SDK computes the checkpoint hint. Permit and message signing are disabled.

A pending request produces `awaiting-finalization` with an empty transaction list.
An already-claimed request produces `already-claimed`, also without signing.
These expected states exit zero; they do **not** mean a claim test passed. Inspect
the report status. `preflight-passed` means ready but execution was not requested.
`passed` requires a successful new claim transaction and all postconditions below.

After a claim, the runner verifies the receipt, request ID, decoded owner/receiver,
positive ETH amount, and on-chain claimed/finalized flags. It reads the wallet's
ETH balance at the block before the claim and at the claim block, and requires
`balanceAfter - balanceBefore + gasUsed * effectiveGasPrice` to equal the decoded
claimed amount. Use an isolated wallet without other transfers in that block;
unrelated balance changes can invalidate this evidence check.

Outputs retain the source report's digest and the new claim receipt and balance
evidence. Historical reports are never rewritten. For another readiness check,
use a new output path. If a previous claim attempt has a signed or broadcast hash,
inspect that transaction before any new execution attempt. The command does not
schedule polling or automatically retry an interrupted claim.

As of the September 8 run recorded in this repository, request 5019 remains
unfinalized. The claim runner's restrictions and result checks are covered by
offline tests; a successful live claim receipt has not yet been recorded.
