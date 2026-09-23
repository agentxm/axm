---
observed_at: "2026-09-23T23:45:00Z"
session: "f6efa5b7-6d4a-4069-9285-9b1fa640211c"
area: "concurrent agent worktrees sharing Git stash and scratchpad"
---

# Shared stash and scratchpad overlapped a verification run

## Context

Several agents worked concurrently in sibling worktrees of one repository.
They shared one session scratchpad directory. This agent ran
`pnpm run verify:affected` in the background, with output going to a generic
log name in the scratchpad. It then stashed its worktree changes to check one
failing CLI specification against the base commit.

## Friction

The log read back held another run's output. It ended with `EXIT=130`, a
format this run never wrote, and reported a `cli:test` failure. The stash was
taken while the background job was still formatting, so that job saw zero
changed files. The stash list is shared across worktrees and already held
another agent's entry.

## Cost / impact

One `verify:affected` run was killed and restarted. One baseline test run and
one format run were repeated. For a time, a failure from another run was
treated as this change's own.

## Outcome

The worktree held all 41 changed paths after `git stash pop`. Formatting and
`verify:affected` were rerun with nothing else touching the worktree, writing
to a log name unique to this work.

## Evidence

The background job printed `format=0` and then `0` for
`git status --short | wc -l`. `git stash list` showed
`stash@{0}: On main: stale pkg-arch snapshot 2026-09-05 (467 files)`.
