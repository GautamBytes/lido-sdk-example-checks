# Documentation audit — September 8, 2026

## Verified findings

| Finding | Source at the audited commit | Reproduction | Status |
| --- | --- | --- | --- |
| Hoodi public client paired with chain ID 17000 | README.md, Initialization and Examples | Actual SDK 4.8.0 throws `INVALID_ARGUMENT: publicClient chain id 560048 does not match provided chain id 17000` | Two-line patch supplied; corrected construction and fixture balance read pass |
| `hoodi` imported from `viem` instead of `viem/chains` | docs/sdk/get-started/basic-examples.md, Core example; similar imports in other snippets | ESM module linking fails: `does not provide an export named 'hoodi'` | Reproduced for Core; remaining affected snippets need individual checks |
| Wrapping getter called on withdrawal module | docs/sdk/get-started/basic-examples.md, Wrap example | Isolated `lidoSDK.withdraw.getContractWstETH()` throws `is not a function`; `lidoSDK.wrap.getContractWstETH` exists | Reproduced API mismatch; replacement not exercised against a live contract |

Source permalink:
https://github.com/lidofinance/lido-ethereum-sdk/tree/14d3236ff91fdb5c783c11abf0f50f063cb942cb

These are documentation usability problems, not evidence of a protocol security
vulnerability. The getter check isolates the call because earlier import and
network failures otherwise mask it. No transaction has been sent.

## Reproduction context and limits

The root initialization snippet relies on imports and an optional wallet provider
from its surrounding context. The harness supplies the documented `LidoSDK`
import and sets `provider = undefined`, then executes the unmodified snippet.
The second root snippet is tested only through construction, before its Views
and transaction Calls sections. These are explicit harness accommodations.

The corrected version changes both `chainId: 17000` occurrences to `chainId: hoodi.id`.
It does not claim to make the entire README a standalone script. A separate
typechecked `src/initialize.ts` provides the complete construction example.

The initial inspection of develop suggested an unsupported-chain error; the
published 4.8.0 package instead retains Holesky and throws the more specific
client/network mismatch. Tests and reported results use the actual observed
4.8.0 error. A pinned source snapshot is not the same as a built develop release.

## Existing coverage and overlap

- The SDK already checks supported networks and SDK/client chain agreement in
  `packages/sdk/src/core/core.ts`. No new guard is proposed.
- Existing `core.test.ts` covers valid construction, invalid arguments, and
  several live/fork-backed operations.
- Upstream CI runs lint, build, types, and a test suite with Anvil/RPC configuration.
  This audit did not find a step explicitly executing these Markdown snippets.
  That is a bounded inspection finding, not a claim about every possible check.
- `examples/rewards` already contains accounting examples. Replacing that package
  with another dashboard or duplicating the SDK is outside this project.
- GitHub's open-pull listing returned PR #385, `v4.9.0`, at audit time; the open
  issues endpoint returned the same PR and no separate issue records. This is
  recorded in `evidence/open-work.json`. Titles alone cannot exclude overlapping
  work on other branches. A maintainer must confirm ownership and desired scope.
- CODEOWNERS identifies `@lidofinance/lido-si` for the SDK and a separate workflow
  review team. No team member has been contacted.

## Evidence strength

We have reproducible technical failures in developer-facing documentation and a
tested minimal correction. We do not have user interviews, support-ticket counts,
usage metrics, or maintainer endorsement. The audit establishes reproducible
technical failures, not their prevalence among SDK users.

## Verification record

`evidence/before-fix.tap` records five passing tests and three expected failures
before replacing the network IDs. `evidence/after-fix.txt` records the corrected
checks. Paths in stored logs are normalized to `<repo>`; results are otherwise
preserved. Current authoritative results are produced by `npm run check` and CI.

The snapshot hashes and patch application are checked as part of the suite.
The proof uses deterministic fixtures for the external RPC boundary. It does
not validate current endpoint availability, on-chain deployment state, browser
wallet behavior, signing, or real transaction execution.

## Dependency audit

At installation npm reported five moderate dependency entries tracing to one
`uuid` advisory, GHSA-w5hq-g745-h8pq, through SDK → OpenZeppelin Merkle tree →
MetaMask utilities. No high or critical entries were reported. The suggested
automatic fix downgraded the SDK to 4.6.0, which would change the reproduction
target, so it was not applied. This small harness does not intentionally exercise
UUID/Merkle functionality; no exploitability assessment was performed. Keep the
published SDK version pinned for this evidence and reassess before expanding use.

https://github.com/advisories/GHSA-w5hq-g745-h8pq
