# Verification against released and source-built SDKs

## Published release

```sh
npm ci --ignore-scripts
npm run verify -- --output reports/released.json
```

This runs the standalone TypeScript check, eight Markdown typechecks, the entire
project test suite, the original-versus-fixed reproduction, and the initialization
demo. A JSON report and matching Markdown summary are written under `reports/`.
The command exits nonzero if a stage fails, the SDK resolves to an unexpected
location, or the test output does not show a complete passing suite.

## Actual SDK source build

With a local Lido Ethereum SDK checkout:

```sh
npm run verify -- --sdk-root /path/to/lido-ethereum-sdk --output reports/source.json
```

The checkout must contain `packages/sdk` and be a Git repository. It is read but
not modified. The command:

1. Records the source commit, dirty flag, and digest of copied source/config files.
2. Copies SDK source, its package/build configuration, and the base TypeScript
   configuration into a temporary directory.
3. Compiles ESM JavaScript and declarations with the project's pinned TypeScript
   compiler and dependencies. No upstream install hooks or package scripts run.
4. Creates an isolated copy of the verification kit whose SDK dependency points
   to that build. Other dependencies come from this project's lockfile.
5. Checks Node's resolved SDK entry against the built artifact, then runs the same
   typechecks, tests, reproduction, and demo in the isolated consumer.
6. Writes the report and cleans temporary source/build/consumer directories.

This closes the earlier limitation where `--docs-root` could select different
documents but still exercise the published SDK. `check:docs -- --docs-root PATH`
remains useful for checking document edits alone; `verify -- --sdk-root PATH`
changes the actual SDK used by the full suite.

## Reports and CI

Reports contain status, Node/TypeScript/viem versions, SDK target kind/version,
source commit and dirty flag for source builds, source/artifact digests, lockfile
and verification-kit digests, stage results/timings, and test counts. Local checkout
paths are replaced with labels in JSON error messages. Generated reports are
ignored by Git. A source checkout's package version may be `0.0.0`; its recorded
commit and digests identify the tested source, not a claimed published release.

CI runs two jobs: the lockfile-pinned release and source commit
`14d3236ff91fdb5c783c11abf0f50f063cb942cb`. Each job publishes a summary and a
downloadable `sdk-verification-*` artifact, including a failed report when the
verifier can produce one. The source revision is deliberately pinned rather than
silently tracking a moving branch. Change it explicitly when reviewing an update.

The unit suite verifies that the reporter propagates child-process failures,
rejects missing source paths and unknown options, and refuses to label empty or
skipped suites as fully verified. Documentation mutation checks cover a bad import,
a wrong getter, and a mismatch between two supported networks.

## Boundaries

The source build uses the dependency versions in this project's lockfile. It does
not reproduce the upstream Yarn lockfile, build CommonJS/playground/documentation
sites, or run upstream's complete Anvil/RPC-based suite. The report describes an
ESM SDK source build plus this project's example checks. Live networks, wallet
signing, transaction broadcasting, and on-chain outcomes remain outside coverage.

Only run source mode on a checkout you trust: source code is compiled and then
executed by the verification suite. A dirty source checkout is supported but is
reported as dirty and identified by the copied-source digest.
