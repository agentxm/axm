---
observed_at: "2026-09-24T18:23:00Z"
session: "e5f06887"
area: "agent session environment / workspace test target"
---

# GIT_EDITOR in the agent session fails every Git-backed workspace test

## Context

Running `pnpm exec nx run workspace:test` on the update specification, the
sync specification, and the source-resolution service tests while landing the
one-update-planner change.

## Friction

Every test that clones or lists a Git remote failed with
`Use of "GIT_EDITOR" is not permitted without enabling allowUnsafeEditor`,
including tests this change did not touch. The agent session exports
`GIT_EDITOR=true`.

## Cost / impact

One full focused-test run produced eight spurious failures across three files,
which had to be separated from the three genuine failures before those could
be diagnosed. Every later test and verification run needed `env -u GIT_EDITOR`
prefixed by hand.

## Outcome

Re-ran with `env -u GIT_EDITOR pnpm exec nx run …`; the Git-backed tests
passed and only the genuine failures remained.

## Evidence

`env | grep ^GIT_` in the session printed `GIT_EDITOR=true`. The failure text
above appeared as the `cause` of each failing Git test.
