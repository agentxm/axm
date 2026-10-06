---
observed_at: "2026-10-06T18:19:10Z"
session: "c8f4"
area: "lint-staged Git-index isolation"
---

# Failed-check rollback collides with an untracked replacement

## Context

A pre-commit regression fixture staged a producer-file deletion and recreated
that path as an untracked file. lint-staged 17.6.0 used `--all --hide-all --stash`
to expose the index for real Nx compiler checks.

## Friction

The expected compiler failure was followed by `Failed to revert to original
state!`; lint-staged retained its automatic backup. Its rollback executes
`git reset --hard HEAD` followed by `git stash apply --index`, and the untracked
replacement collided during that restoration.

## Cost / impact

The regression required a recovery-mode change and another focused run.

## Outcome

The host adapter uses supported `--no-revert`, preserving staged auto-fixes
while restoring unstaged and untracked work. The deletion/replacement regression
then passed, including original untracked content and staged-deletion readback.
