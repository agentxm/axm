---
observed_at: "2026-09-25T11:45:00Z"
session: "mq22"
area: "local verification: agent session environment"
---

# A session-set GIT_EDITOR made every Git-source test fail under verify:affected

## Context

Running `pnpm run verify:affected` for an MCP projection change in `axm`.
The change touched no Git-source code.

## Friction

Four workspace tests and the `cli:test` target failed. Every failure traced to
simple-git refusing the environment: `Use of "GIT_EDITOR" is not permitted
without enabling allowUnsafeEditor`. The agent session exports
`GIT_EDITOR=true`, which the tests inherit; the failing names (Git locator
discovery, Pack members pinned to a Git commit) gave no hint the cause was
environmental.

## Cost / impact

Two full `verify:affected` runs (about 2 minutes each) and one targeted rerun
before the cause was found; a third full run with the variable unset was
needed for delivery evidence.

## Outcome

Confirmed by rerunning the three failing files with `env -u GIT_EDITOR`: all
passed. Delivery verification was rerun the same way.

## Evidence

- `env | grep ^GIT_` in the session prints `GIT_EDITOR=true`.
- Failing files: `packages/core/workspace/src/resolution/packs-inherit-members-from-one-source-view.spec.ts`,
  `packages/core/workspace/src/lifecycle/install/git-discovery.test.ts`,
  `packages/core/workspace/src/lifecycle/install/locator-selection.test.ts`.
