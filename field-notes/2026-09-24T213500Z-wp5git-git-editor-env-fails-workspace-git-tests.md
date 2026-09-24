---
observed_at: "2026-09-24T21:35:00Z"
session: "ce1ec542"
area: "environment: agent session variables under workspace:test"
---

# GIT_EDITOR in the session environment fails every simple-git backed workspace test

## Context

Running focused `pnpm exec nx run workspace:test` over `src/reconciliation`,
`src/lifecycle`, `src/packs/lifecycle`, and `src/configuration` to verify a
change to the reconciliation cleanup step and the activation refusal wording.
The agent session exports `GIT_EDITOR=true`.

## Friction

Fourteen tests across six files failed with the same cause, none touching the
changed code: Git-locator discovery, source switches, Git restoration during
sync, and pinned-tag updates. simple-git refused every clone with
`Use of "GIT_EDITOR" is not permitted without enabling allowUnsafeEditor`,
surfaced as `GitOperationFailed: Failed to shallow clone file:///...`.

## Cost / impact

One extra focused run to isolate a single failure, one rerun with the variable
unset, and the full `verify:affected` run had to be wrapped in
`env -u GIT_EDITOR`. The failures were indistinguishable from a regression
until the cause text was read.

## Outcome

Rerunning the same files with `env -u GIT_EDITOR` passed 17 of 17. The
variable was unset for the final verification run; no repository change was
made for it.

## Evidence

- `echo "GIT_EDITOR=[$GIT_EDITOR]"` printed `GIT_EDITOR=[true]`.
- Failing files: `src/lifecycle/install/git-discovery.test.ts`,
  `src/lifecycle/install/locator-selection.test.ts`,
  `src/lifecycle/update/advances-resolution-within-intent.spec.ts`,
  `src/lifecycle/install/pack-source-switches-are-member-diffed.spec.ts`,
  `src/lifecycle/install/source-switches-are-previewed-and-atomic.spec.ts`,
  `src/reconciliation/sync/preserves-configuration-and-resolutions.spec.ts`.
- Error origin: `packages/core/workspace/src/resolution/sources/git/operations.ts:88`,
  simple-git plugin `unsafe`.
