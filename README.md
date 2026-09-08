# Lido SDK example checks

[![Example checks](https://github.com/GautamBytes/lido-sdk-example-checks/actions/workflows/checks.yml/badge.svg)](https://github.com/GautamBytes/lido-sdk-example-checks/actions/workflows/checks.yml)

A reproducible audit and automated checks for Lido Ethereum SDK
documentation. Maintained by [GautamBytes](https://github.com/GautamBytes).
An independent community project.

## What works today

- Reproduce a network mismatch in the upstream README using the real SDK.
- Apply a two-line initialization fix and execute the corrected Markdown snippets.
- Verify an ETH balance read through real SDK/viem code using a deterministic RPC fixture.
- Reproduce two additional documentation errors: an invalid chain import and a
  wrapping getter called on the wrong module, with corrected examples for both.
- Typecheck eight selected Markdown snippets as independent TypeScript modules.
- Exercise wrap contract reads and pending/finalized/claimed withdrawal states
  through the real SDK using deterministic RPC fixtures.
- Check source snapshot integrity and patch application automatically.
- Build the actual upstream SDK in isolation and run the same suite against it.
- Produce JSON/Markdown reports with SDK provenance, artifact hashes, and test results.
- Run opt-in Hoodi checks against deployed contracts at one finalized block.
- Run bounded, opt-in Hoodi staking, wrapping, and withdrawal-submission transactions.

The SDK already rejects mismatched client/SDK networks. This project improves
documentation and its verification; it does not introduce a new SDK network guard.

## Run

Requires Node.js 22+ and Git. The shortest review path is:

```sh
git clone https://github.com/GautamBytes/lido-sdk-example-checks.git
cd lido-sdk-example-checks
npm ci --ignore-scripts
npm run verify -- --output reports/released.json
```

`verify` runs the typechecks, complete test suite, before/after reproduction, and
initialization demo, then writes `reports/released.json` and `.md`. For only the
network-mismatch demonstration, run `npm run reproduce`. See the
[review guide](docs/reviewer-guide.md) for the three findings and expected results.

Dependency installation needs internet access. The commands above then run without
an RPC URL, API key, wallet, or funds. The balance fixture returns exactly 1 ETH;
it is synthetic test data, not a live account balance.

To check live Hoodi state using the public ethPandaOps RPC:

```sh
npm run check:live
```

This needs internet access but no wallet, key, or funds. It verifies the network,
deployed contracts, a public contract's ETH balance, the wrapping rate, and one
existing withdrawal request. It writes `reports/hoodi-live.json` and `.md`.
See [live verification](docs/live-verification.md) for endpoint configuration,
report interpretation, and the manual GitHub Actions workflow.

For actual testnet transactions, see [transaction verification](docs/transaction-verification.md).
The separate `check:transactions` command requires an isolated funded Hoodi wallet
and `--execute` before it signs or broadcasts. It records receipts and balance changes.
The [September 8 Hoodi run](evidence/hoodi-transactions-20260908.md) includes successful
staking, wrapping, and withdrawal-submission receipts. That report does not
include a later claim receipt.

Expected reproduction output:

```text
BEFORE: INVALID_ARGUMENT: publicClient chain id 560048 does not match provided chain id 17000
AFTER: initialized Hoodi; SDK/client chain IDs agree (560048)
```

`npm run reproduce` exits successfully only if the original fails as expected and
the corrected snippet initializes successfully. In `npm test`, tests of known
upstream failures also pass when those expected failures are reproduced.

## Review the contribution

| Material | Purpose |
| --- | --- |
| [Review guide](docs/reviewer-guide.md) | Short failure → patch → passing-check path and evidence boundaries |
| [Contribution package](docs/upstream-contribution.md) | Verified upstream targets, patch scope, and proposed contribution text |
| [Audit](docs/audit.md) | Findings, existing coverage, overlap review, limitations |
| [Evidence manifest](evidence/manifest.json) | Exact upstream commit, versions, source hashes |
| [Patch](patches/0001-readme-hoodi-chain-id.patch) | Minimal upstream README correction |
| [Corrected README snapshot](examples/README.md) | Exact document exercised by the tests |
| [Standalone initialization](src/initialize.ts) | Complete, typechecked construction example |
| [Usage examples](examples/usage.md) | Four checked initialization patterns |
| [Basic examples](examples/basic-examples.md) | Core, staking, withdrawal, and wrapping examples |
| [Coverage and integration](docs/coverage.md) | Exact coverage, external-checkout command, and troubleshooting |
| [Getting-started patch](patches/0002-getting-started-examples.patch) | Corrections to the two upstream documentation pages |
| [SDK build verification](docs/verification.md) | Released/source SDK verification commands and report fields |

The original documentation is pinned to upstream commit
[`14d3236`](https://github.com/lidofinance/lido-ethereum-sdk/tree/14d3236ff91fdb5c783c11abf0f50f063cb942cb)
(September 3, 2026). Runtime verification uses the published SDK **4.8.0**,
viem **2.56.3**, and the committed npm lockfile. Source verification additionally
builds ESM/declarations from the pinned upstream commit and runs this project's
suite against that build. It does not run upstream's full test suite.

To inspect/apply the patch in a separate SDK checkout at that commit:

```sh
git apply --check /path/to/lido-sdk-example-checks/patches/0001-readme-hoodi-chain-id.patch
git apply /path/to/lido-sdk-example-checks/patches/0001-readme-hoodi-chain-id.patch
git apply --check /path/to/lido-sdk-example-checks/patches/0002-getting-started-examples.patch
git apply /path/to/lido-sdk-example-checks/patches/0002-getting-started-examples.patch
```

## Coverage and next steps

The project includes source snapshots, two upstream documentation patches,
eight typechecked snippets, and execution checks for initialization and three
read paths. The suite also restores the wrong import/getter in temporary copies
and verifies that the compiler catches them. An external-checkout test confirms
the original documents fail and their patched versions pass.

Upstream integration and review remain separate from this repository's passing
CI. The checker can target a separate checkout using `--docs-root`; it uses the
SDK installed in this project, not an automatically built SDK from that checkout.
To build and test the actual source SDK, use:

```sh
npm run verify -- --sdk-root /path/to/lido-ethereum-sdk --output reports/source.json
```

CI verifies both targets and attaches downloadable reports. See
[verification details](docs/verification.md) for the build environment and limits.

Tests execute only reviewed, committed Markdown; the helper is not a sandbox for
arbitrary documents. TypeScript checks `src/initialize.ts` and the eight snippets
listed in `examples/manifest.json`. The two root README fragments retain their
original runtime-only checks. Unselected Markdown blocks and dependency declaration
files are outside this typechecking scope. Transaction functions are typechecked
but never called in the offline suite. The separate `check:live` command verifies
live read paths only. The opt-in transaction runner separately verifies local
signing and staking/wrapping/withdrawal-submission outcomes. A claim-only mode is
available once the request finalizes. No live claim receipt has been recorded
here yet. Browser wallet flows remain outside these checks.

## License

MIT for original work; see [LICENSE](LICENSE). Copied Lido documentation and
derived examples/patches retain Lido's MIT terms and copyright notice in
[licenses/Lido-MIT.txt](licenses/Lido-MIT.txt). See [NOTICE](NOTICE) for attribution.
Dependency licenses remain their respective authors' licenses.
