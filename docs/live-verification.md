# Live Hoodi verification

```sh
npm ci --ignore-scripts
npm run check:live
# Optional output location:
npm run check:live -- --output reports/hoodi-live.json
```

Node.js 22+, Git, and internet access are required. The default endpoint is
`https://rpc.hoodi.ethpandaops.io`, listed by the
[Hoodi network site](https://www.hoodi.dev/). Set `HOODI_RPC_URL` in your environment
to use another HTTP(S) provider. Do not commit provider credentials. Custom URLs
are omitted from reports, and transport errors omit provider response details.
Each RPC request times out after 10 seconds, with no retries or silent fallback.

## What the command checks

1. Ask the endpoint for its chain ID; stop unless it is Hoodi (`560048`).
2. Capture a finalized block's number, hash, and timestamp.
3. Resolve the SDK's locator, wstETH, and withdrawal queue. Compare their addresses
   with the reviewed [Lido deployment list](https://docs.lido.fi/deployed-contracts/hoodi/)
   and require deployed bytecode at all three addresses.
4. Read the locator contract's ETH balance through `sdk.core.balanceETH`. Zero is
   valid; this is a public contract balance, not a user's wallet balance.
5. Resolve wstETH through `sdk.wrap.getContractWstETH` and read a positive
   `stEthPerToken` value, expressed in 18-decimal units.
6. Discover the queue's last existing request ID and read its status through
   `sdk.withdraw.views.getWithdrawalStatus`. Record its amounts, timestamp, owner,
   finalization flag, and claim flag. No request is created.

All contract, code, and balance reads are pinned by the transport to the captured
block number, including reads made internally by the SDK. The allowed RPC methods
are `eth_chainId`, `eth_getBlockByNumber`, `eth_getCode`, `eth_getBalance`, and
`eth_call`. Signing and broadcasting methods are rejected before reaching the
provider. No wallet client is constructed.

The reviewed deployment addresses are explicit constants in
`scripts/lib/live-read.mjs`, checked against the published list on September 8,
2026. Address changes cause a failed check and require a deliberate review/update.
The RPC-reported chain and finalized block are trusted; this command does not
independently validate consensus or compare providers.

## Results and failure behavior

Generated JSON/Markdown reports are saved under `reports/` and ignored by Git.
JSON includes the block, resolved contracts, values, stages, SDK version/artifact
digest, Node version, project commit/dirty flag, checker digest, and lockfile digest.
The command uses the installed SDK; it does not build a source checkout.

A complete passing run exits zero. RPC errors, a wrong network, changed deployment,
missing bytecode, invalid responses, and failed assertions exit nonzero. An empty
withdrawal queue produces an `incomplete` report with the status check marked
`skipped`, also exiting nonzero. Invalid command-line arguments exit 2. A failed
check retains earlier successful stages rather than reporting the entire run as
passed. Missing later checks were not executed.

The **Hoodi live reads** GitHub Actions workflow can be run manually using **Run
workflow**. It uses the committed dependency lockfile, adds a job summary, and
uploads the `hoodi-live-read-report` artifact on success or failure when a report
exists. Its public RPC availability does not affect the ordinary offline CI jobs.
It has no schedule and does not consume a wallet or secret.

The default `npm test` suite checks the live runner with synthetic RPC responses;
only an explicit `npm run check:live` run contacts the network. Both the released
and source-built SDK targets run those offline regression tests.

## Scope limits

A passing report proves those read paths worked against the provider's reported
state at that block. It does not exercise the Markdown transaction functions,
wallet signing, staking, wrapping transactions, withdrawal submission, or claiming.
The single observed withdrawal may be pending, finalized, or claimed; a run does
not require or demonstrate all three states. Transaction verification is separate
work requiring test ETH, a test wallet, and transaction receipts.
