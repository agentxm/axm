---
observed_at: "2026-09-24T02:00:00Z"
session: "r4c9"
area: "worktree verification workflow"
---

# Proving e2e failures predate commits needed patch reversal

## Context

Closing review residuals on a branch in an isolated review worktree. The
session rules forbade `git stash` and touching any other worktree, and asked
for new commits only (no amend or rebase).

## Friction

Two e2e suites failed during verification: the git-index lint example in
`apps/cli-e2e/src/cli-commands/lint/command.e2e.ts`, and Pack installs in
`apps/cli-e2e/src/cli-commands/packs/packs.e2e.ts`, which were blocked by the
minimum release age. Attributing them to the branch tip rather than to the new
commits needed the tip's code in the working tree. With no stash and no second
worktree allowed, the only route was to save `git diff <tip>` as a patch in the
scratchpad, `git apply -R` it, rerun the e2e, then `git apply` it again and
diff the result against the saved patch.

## Cost / impact

One extra reverse-and-reapply cycle and two extra e2e runs, the first of which
matched no test because of the name filter. Until the patch was reapplied, the
worktree briefly held a state where the committed residual looked reverted.

## Outcome

Both failures reproduced at the branch tip, so they predate the residual
commits. The patch was restored exactly, and the difference against the saved
patch was empty.

## Evidence

- Pack e2e at the tip: `AssertionError: expected 6 to be +0` (exit code 6 is
  blocked), with the detail "requires a release the minimum release age still
  holds back".
- Lint e2e at the tip: `expected [ 'skill/skill-md-present', …(2) ] to include
'workspace/configured-but-not-installed'`.
