---
observed_at: "2026-09-24T18:35:00Z"
session: "k7m2"
area: "verify:affected in an agent shell"
---

# GIT_EDITOR in the agent shell failed every Git-backed workspace test

## Context

Running `pnpm run verify:affected` after consolidating activation realization.
The agent shell exports `GIT_EDITOR=true`.

## Friction

Eleven workspace test files failed with `GitPluginError: Use of "GIT_EDITOR"
is not permitted without enabling allowUnsafeEditor` from simple-git, none of
them touched by the change. The failures were mixed in with seven real CLI
test failures, so the verification result could not be read at a glance.

## Cost / impact

One full affected verification run whose workspace test outcome was unusable,
plus a targeted rerun of three of the failing files with the variable unset to
establish that they pass. The final verification is run with
`env -u GIT_EDITOR`.

## Outcome

Rerun without `GIT_EDITOR` passed the sampled files (22 tests). The variable
comes from the session environment, not from the repository.

## Evidence

- `env | grep GIT_` → `GIT_EDITOR=true`
- `src/resolution/sources/git/operations.test.ts (16 tests | 11 failed)` with
  `plugin: 'unsafe'`, `task.commands: ['ls-remote', '--heads', '--tags', 'probe']`
