---
observed_at: "2026-09-25T01:26:00Z"
session: "rc7k"
area: "environment: GIT_EDITOR in the agent shell"
---

# `GIT_EDITOR=true` in the agent shell fails every git-backed workspace test

## Context

Running focused `workspace:test` targets after moving Registry client
construction behind `RegistryClientFactory`, in a worktree of `agentxm/axm`.

## Friction

The agent shell exports `GIT_EDITOR=true`. Every test that spawns git through
the repository's git adapter failed with
`Use of "GIT_EDITOR" is not permitted without enabling allowUnsafeEditor`,
which read at first as a regression from the change under test.

## Cost / impact

One extra focused test run to separate the git failures from the change's own
failures; 15 unrelated test failures in the first workspace run. Every later
test and `verify:affected` run needed `env -u GIT_EDITOR` prefixed.

## Outcome

Recovered by unsetting the variable for each test invocation. No repository
change.

## Evidence

`echo "GIT_EDITOR=$GIT_EDITOR"` printed `GIT_EDITOR=true`; the spec
`src/discovery/discover/identifies-local-only-recommendations.spec.ts` failed
with the variable set and passed with `env -u GIT_EDITOR`.

## Existing context

A note from the previous day records the same variable failing affected
verification in this repository.
