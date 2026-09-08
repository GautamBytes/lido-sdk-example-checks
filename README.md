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
  wrapping getter called on the wrong module.
- Check source snapshot integrity and patch application automatically.

The SDK already rejects mismatched client/SDK networks. This project improves
documentation and its verification; it does not introduce a new SDK network guard.

## Run

Requires Node.js 22+ and Git. From a fresh clone:

```sh
npm ci --ignore-scripts
npm run check
npm run reproduce
npm run demo
```

Dependency installation needs internet access. The commands above then run without
an RPC URL, API key, wallet, or funds. The balance fixture returns exactly 1 ETH;
it is synthetic test data, not a live account balance.

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
| [Audit](docs/audit.md) | Findings, existing coverage, overlap review, limitations |
| [Evidence manifest](evidence/manifest.json) | Exact upstream commit, versions, source hashes |
| [Patch](patches/0001-readme-hoodi-chain-id.patch) | Minimal upstream README correction |
| [Corrected README snapshot](examples/README.md) | Exact document exercised by the tests |
| [Standalone initialization](src/initialize.ts) | Complete, typechecked construction example |

The original documentation is pinned to upstream commit
[`14d3236`](https://github.com/lidofinance/lido-ethereum-sdk/tree/14d3236ff91fdb5c783c11abf0f50f063cb942cb)
(September 3, 2026). Runtime verification uses the published SDK **4.8.0**,
viem **2.56.3**, and the committed npm lockfile. This is not a claim that the
unreleased upstream branch has been built or its full test suite run.

To inspect/apply the patch in a separate SDK checkout at that commit:

```sh
git apply --check /path/to/lido-sdk-example-checks/patches/0001-readme-hoodi-chain-id.patch
git apply /path/to/lido-sdk-example-checks/patches/0001-readme-hoodi-chain-id.patch
```

## Coverage and next steps

The project includes source snapshots, two README corrections, and a local
verification harness. The invalid imports and wrapping getter in the other
documents are reproduced but not yet patched here. Next steps are to repair
those snippets, expand TypeScript coverage, and make the checks suitable for
the upstream documentation workflow.

Tests execute only reviewed, committed Markdown; the helper is not a sandbox for
arbitrary documents. TypeScript typechecking currently covers `src/initialize.ts`.
Markdown fixtures are transpiled and executed, not comprehensively typechecked.
No live-chain or transaction-signing behavior is covered by this proof of work.

## License

MIT for original work; see [LICENSE](LICENSE). Copied Lido documentation and
derived examples/patches retain Lido's MIT terms and copyright notice in
[licenses/Lido-MIT.txt](licenses/Lido-MIT.txt). See [NOTICE](NOTICE) for attribution.
Dependency licenses remain their respective authors' licenses.
