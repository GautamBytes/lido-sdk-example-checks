# Review the example checks

## Reproduce from a clean checkout

Requires Node.js 22+ and Git. Use the clone/install/verify commands in the
[README](../README.md#run). Dependency installation needs internet; verification
then runs offline without a wallet or RPC credentials.

The expected result is a successful verifier exit, eight Markdown snippets
typechecked, and 56 passing tests with none skipped or cancelled. The generated
`reports/released.md` summarizes stages; `reports/released.json` includes SDK and
dependency provenance. Expected failures in the original documentation count as
passing regression tests when the harness observes the correct error.

## Follow each finding to its fix

| Original problem | Supplied correction | Reproducible evidence |
| --- | --- | --- |
| Hoodi client (`560048`) paired with SDK chain ID `17000` | [Patch 1](../patches/0001-readme-hoodi-chain-id.patch) sets both README instances to `hoodi.id`; patch 2 fixes the selected getting-started examples | `npm run reproduce` prints the original `INVALID_ARGUMENT` and corrected initialization; `test/documentation.test.mjs` also exercises the corrected fixture balance read |
| `hoodi` imported from `viem` | [Patch 2](../patches/0002-getting-started-examples.patch) imports it from `viem/chains` | Original module import fails; typecheck mutation tests restore the bad import and require diagnostics at the Markdown source line |
| `withdraw.getContractWstETH()` does not exist | Patch 2 uses `wrap.getContractWstETH()` | The isolated original call fails; corrected Markdown executes the actual SDK getter and decodes a fixture contract read; mutation tests catch the wrong getter |

The [frozen manifest](../evidence/manifest.json) identifies the original files
and hashes. Tests apply both patches to those files and require byte-for-byte
agreement with the checked examples. Patch 2 also supplies explicit imports,
function inputs, and withdrawal-result handling for independent typechecking;
these usability improvements are not additional SDK defects.

To see original-versus-patched diagnostics against a real upstream checkout,
follow the [contribution commands](upstream-contribution.md#validate-against-upstream).
The [dated upstream review](../evidence/upstream-review-20260908.json) records
which public branches and open PR were checked for overlap.

## Inspect additional evidence

- **Actual SDK source:** `npm run verify -- --sdk-root /path/to/lido-ethereum-sdk --output reports/source.json`
  builds the SDK's ESM/declarations and runs this same suite against that build.
  See [build scope](verification.md). This is separate from selecting upstream
  Markdown with `--docs-root`.
- **CI:** [Example checks](https://github.com/GautamBytes/lido-sdk-example-checks/actions/workflows/checks.yml)
  publishes released/source reports as artifacts. Select a run for the exact
  commit under review.
- **Live reads:** the [manual live workflow](https://github.com/GautamBytes/lido-sdk-example-checks/actions/workflows/live.yml)
  produces finalized-block reports. Local `npm run check:live` is optional and
  needs internet; it is not part of the offline reproduction.
- **Mined transactions:** the [Hoodi evidence summary](../evidence/hoodi-transactions-20260908.md)
  links the staking, wrapping, and withdrawal-submission receipts; its
  [JSON report](../evidence/hoodi-transactions-20260908.json) records decoded
  outcomes and balance changes. These historical files identify the implementation
  used for that run. A successful claim receipt has not yet been published here.

## Interpret the result

Passing checks demonstrate the selected documentation corrections with the
recorded SDK targets. The live transaction runner uses a guarded local signer
and invokes SDK methods directly; it does not execute the exact Markdown
transaction wrappers or browser connection flow. Synthetic withdrawal states
do not establish live claimability. See [coverage](coverage.md) for all boundaries.

Upstream adoption, maintainer endorsement, and the number of users affected
are not established by these checks. No upstream PR has been submitted by this
project. Historical logs retain their original test counts and scope.
