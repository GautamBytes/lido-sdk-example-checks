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
protocol, and claim verification needs a separate transaction after that point.
Do not present these three transactions as a completed withdrawal-and-claim cycle.
