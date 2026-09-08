# Example coverage and integration

## Selected documentation

The table below describes the offline Markdown checks. The manifest in
`examples/manifest.json` is the explicit selection. Each snippet
is extracted without injecting imports, `any` types, global wallet declarations,
or type-error suppressions. Imports and function inputs appear in the Markdown.

| Snippet | Strict TypeScript | Runtime coverage |
| --- | --- | --- |
| Public-client initialization | Yes | SDK construction; no wallet or RPC |
| RPC-URL initialization | Yes | Client construction; no fetch |
| Wallet-client initialization | Yes | Explicit provider accepted without requests |
| Separate modules | Yes | Stake construction and shared core for wrapping |
| Core | Yes | ETH balance read, bigint result, provider failure |
| Stake | Yes | Import without RPC; transaction function not invoked |
| Withdraw | Yes | ABI decoding, request order/IDs, three states, empty list, malformed data and wrong response length |
| Wrap | Yes | Locator lookup, actual SDK getter, contract read and rate decoding |

Withdrawal fixtures include pending (`false/false`), finalized but unclaimed
(`true/false`), and claimed (`true/true`) states. Values, IDs, and account/contract
addresses other than the locator are synthetic. Tests do not establish whether
a real request is claimable today or estimate withdrawal timing.

The fixture validates method names, read destinations, ABI selectors, and request
arguments. It encodes responses with the SDK/viem ABIs. Signing, broadcasts, unknown
methods, unknown destinations, and unknown fixture IDs are rejected. The actual
SDK and viem implementations are not mocked. SDK cache-key evaluation can repeat
locator reads, so tests do not promise an exact count of locator calls.

## Commands

```sh
npm ci --ignore-scripts
npm run check
npm run check:docs
npm run reproduce
```

`check` runs the standalone example typecheck, the eight Markdown typechecks, and
all tests. CI runs it on pushes and pull requests. Mutation tests temporarily
restore the bad `hoodi` import and wrong getter and require TypeScript diagnostics
at the correct Markdown lines; these are successful tests of expected failures.

Original source snapshots are never changed. The test suite also reconstructs a
temporary checkout, verifies original documentation fails, applies both patches,
compares the resulting files with the checked examples, and runs the CLI against
that checkout. No repository download is needed for this test.

## Check an upstream checkout

Apply the patches to a separate checkout at the commit in `evidence/manifest.json`.
From this project's root, run:

```sh
npm run check:docs -- --docs-root /path/to/lido-ethereum-sdk
```

The checker reads the upstream paths in the manifest and reports diagnostics
using the target document's filename and line number. It still resolves SDK,
viem, and TypeScript from this project's pinned installation. It neither changes
that checkout nor verifies that its unpublished SDK build is compatible.

Use the separate [source-build verifier](verification.md) to compile the SDK from
that checkout and run the full suite against the resulting ESM/declaration build.

For CI evaluation alongside an upstream build, check out this project at a reviewed
commit, install its lockfile, and run the command above pointing to the SDK checkout.
Use the same command after applying the documentation patches. A maintainer should
decide whether to keep this separate check or port the manifest, extraction, and
typechecking helpers into the SDK's own dependency/build workflow. No upstream
workflow or pull request has been published by this project.

The [contribution package](upstream-contribution.md) records the current upstream
overlap review, separates the minimal README fix from the broader example edits,
and provides commands to reproduce failures before applying the patches.

## Troubleshooting

| Result | Meaning and next step |
| --- | --- |
| `TS2305` on `hoodi` | Import it from `viem/chains`; the regression test intentionally restores the incorrect import. |
| `TS2339` on the wrapping getter | Use `lidoSDK.wrap.getContractWstETH()`. |
| `Missing TypeScript snippet` | Check the manifest's exact heading and zero-based fence index; selection never falls through to the next peer section. |
| Missing SDK/viem module | Run from this project's root after `npm ci --ignore-scripts`. |
| `INVALID_ARGUMENT` network mismatch | Configure SDK and client consistently with `hoodi.id`; the root reproduction intentionally demonstrates the original mismatch. |
| `Unexpected RPC` in a test | A snippet made an unmodeled call; inspect it before extending the fixture. |
| Live RPC error when using an example | Replace `<RPC_URL>` with a working Hoodi endpoint; offline fixtures do not test network availability. |

## Limits

Only the eight selected blocks receive full typechecking; the rest of the copied
pages are context, not a claim of complete page coverage. Root README fragments
have execution checks but not full typechecking. Dependency declarations use
`skipLibCheck`; diagnostics in selected example source are checked strictly.
The extractor supports the column-zero triple-backtick TypeScript fences used
by these files, not every Markdown dialect.

The offline Markdown suite does not exercise browser connection flows, account
authorization, permit signing, live staking limits, transaction sending, or
mining. It does not contact live RPCs or verify deployment state. The separate
opt-in [Hoodi checker](live-verification.md) verifies deployed read paths at one
block. The [transaction runner](transaction-verification.md) separately exercises
a guarded local signer, a withdrawal permit, and mined staking, wrapping, and
withdrawal-submission transactions; see the
[recorded receipts](../evidence/hoodi-transactions-20260908.md).

The live runner invokes SDK methods directly rather than the exported Markdown
transaction functions. Those functions require a provider/account supplied by
the consuming application. Their typechecks and successful imports do not prove
browser wallet behavior or transaction success. A live claim receipt and
exhaustive staking-limit coverage remain outside the recorded evidence.
