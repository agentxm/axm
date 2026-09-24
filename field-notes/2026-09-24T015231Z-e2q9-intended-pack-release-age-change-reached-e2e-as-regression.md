---
observed_at: "2026-09-24T01:52:31Z"
session: "e2q9"
area: "cli-e2e witnesses; verify:pr lanes"
---

# Intended behavior changes surfaced only as an e2e regression

## Context

The task was to fix the e2e failures that `pnpm run verify:pr` reported on the
single-ownership branch: 13 tests in 5 files. Every source lane had passed:
lint, typecheck, build, workspace tests, CLI tests, and the artifact check.

## Friction

The failures were handed over as a Pack install regression, with suspects in
the Pack graph selection step. Both causes were instead intended changes whose
e2e witnesses still encoded the earlier behavior.

- Commit `5730b6ead` makes a named Pack install hold members it selects by range
  under the minimum release age. Its message, the packs and settings help
  topics, and an in-process test all say so. The e2e fixtures publish members
  seconds before installing and keep the default 24h window, so installs exited
  with code 6.
- Commit `82971c428` reports a missing accepted resolution once, under the
  lockfile rule. The lint e2e test still expected the retired
  configured-but-not-installed finding.

## Cost / impact

One full `verify:pr` run failed at the e2e lane. Each cause needed a
reproduction and a comparison against the last green commit, which took a
detached worktree, before it could be classified as a stale witness rather than
a product defect.

## Outcome

The e2e fixtures now declare `minimumReleaseAge: "0s"`. The root-install parity
check ignores the evaluation timestamp. The lint witness asserts the lockfile
finding. The product code is unchanged.

## Evidence

- Blocked plan description: "The selected pack graph includes a release held by
  the minimum release age".
- 9 tests in `src/packs.e2e.test.ts` failed at the pre-fix commit `12846ca60`.
