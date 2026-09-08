# Upstream documentation contribution package

## Target and overlap review

Reviewed September 8, 2026 against
[`lidofinance/lido-ethereum-sdk`](https://github.com/lidofinance/lido-ethereum-sdk).
The default branch `develop` and open [release PR #385](https://github.com/lidofinance/lido-ethereum-sdk/pull/385)
both point to `14d3236ff91fdb5c783c11abf0f50f063cb942cb`, our audited revision.

Of the five advertised public branch tips, `develop`, `main`, and
`chore/dependabot` contain the same three target documents as the frozen audit.
Both patches apply and produce this project's checked examples on those branches.
Against a complete checkout of current `develop`, the original selected snippets
fail typechecking and all eight patched snippets pass against published SDK 4.8.0.
PR #385 changes 33 files, including error-code documentation, but none of the
three patch targets. The current default/release branches therefore still contain
the documented problems; the open PR does not correct them.

The other two branches are outside the patches' target scope:
`feature/si-2100-read-overview` (January 28, 2026) retains older Holesky/provider
examples, and `fix/populate-gas-limit` (June 19, 2024) lacks the two getting-started
pages. The patches do not apply as-is to either branch. Their older documentation
is not evidence that the current Hoodi examples have been fixed.

The [machine-readable review](../evidence/upstream-review-20260908.json) records
branch commits, document hashes, patch outcomes, compiler results, and the complete
PR file list. The review also inspected the 30 most recently updated closed PR
titles and the basic-examples file history. It does not establish absence of
overlap in every closed PR diff, deleted branch, fork, or private change.

## Proposed patch scopes

1. **Minimal README correction:** [patch 1](../patches/0001-readme-hoodi-chain-id.patch)
   changes exactly two `chainId` values to `hoodi.id`. It preserves surrounding
   examples and the SDK's existing network validation.
2. **Standalone getting-started examples:** [patch 2](../patches/0002-getting-started-examples.patch)
   corrects chain configuration/imports and the wrapping getter, adds missing
   imports and explicit provider/account inputs, and handles an absent decoded
   withdrawal result. It changes two documentation pages and is a broader
   standalone-example edit; review its presentation choices separately.

Neither patch changes SDK runtime code, dependencies, or upstream CI. The patches
can be reviewed independently. This repository's checker integration is a
separate possible contribution, described in [coverage](coverage.md#check-an-upstream-checkout).

## Validate against upstream

From this project's root after `npm ci --ignore-scripts`, use a new temporary
upstream checkout. These commands change only that checkout's documentation:

```sh
kit_root="$PWD"
sdk_review_dir="$(mktemp -d "${TMPDIR:-/tmp}/lido-sdk-review.XXXXXX")"
git clone https://github.com/lidofinance/lido-ethereum-sdk.git "$sdk_review_dir"
git -C "$sdk_review_dir" checkout --detach 14d3236ff91fdb5c783c11abf0f50f063cb942cb

# Expected exit 1: original selected snippets include TS2305 import errors.
npm run check:docs -- --docs-root "$sdk_review_dir"

git -C "$sdk_review_dir" apply --check "$kit_root/patches/0001-readme-hoodi-chain-id.patch"
git -C "$sdk_review_dir" apply "$kit_root/patches/0001-readme-hoodi-chain-id.patch"
git -C "$sdk_review_dir" apply --check "$kit_root/patches/0002-getting-started-examples.patch"
git -C "$sdk_review_dir" apply "$kit_root/patches/0002-getting-started-examples.patch"

# Expected exit 0: Typechecked 8 documentation snippets against the installed SDK.
npm run check:docs -- --docs-root "$sdk_review_dir"
git -C "$sdk_review_dir" diff --check
git -C "$sdk_review_dir" diff --stat
```

Run the expected-failure command separately if your shell exits on any nonzero
status. `check:docs` selects upstream documents but uses this project's installed
SDK. For source compatibility, run `verify -- --sdk-root` against a pristine
checkout of the revision above, following [verification](verification.md).

## Prepared contribution text

The following is proposed review text, not a submitted PR or maintainer approval.

### Patch 1 title

Fix Hoodi chain IDs in README initialization examples

### Patch 1 description

The README pairs a Hoodi public client with SDK chain ID `17000`, so construction
fails with a client/network mismatch. Set both SDK initializations to `hoodi.id`
to agree with the documented public client. SDK runtime behavior is unchanged.

Validation: the real SDK reproduces the original failure; corrected construction
and a deterministic ETH balance read pass. The two-line patch applies to current
`develop` at `14d3236ff91fdb5c783c11abf0f50f063cb942cb`.

### Patch 2 title

Fix imports and wrapping getter in standalone getting-started examples

### Patch 2 description

Selected getting-started examples import `hoodi` from the wrong module, combine
Hoodi clients with chain ID `17000`, and call the wrapping getter on the withdrawal
module. Correct those references and make all eight selected blocks independent
TypeScript modules with explicit inputs. Transaction examples export functions
that callers invoke with their wallet provider and account.

Validation: the original snippets fail, both documentation patches apply, and
all eight corrected snippets typecheck. Regression tests restore the wrong import
and getter and require compiler diagnostics. Runtime fixtures cover construction
and selected reads; the exact browser transaction wrappers are not exercised live.

See this project's [review guide](reviewer-guide.md) for reproducible evidence and
the distinction between offline examples and separate local-signer transactions.
