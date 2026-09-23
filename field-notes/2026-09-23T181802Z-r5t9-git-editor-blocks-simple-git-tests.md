---
observed_at: "2026-09-23T18:18:02Z"
session: "17d2dbaf-2320-4de6-8c3a-76bfe6b80333"
area: "workspace test target in an agent shell"
---

# Inherited GIT_EDITOR failed Git-backed workspace tests

## Context

Ran `pnpm exec nx run workspace:test --skip-nx-cache --excludeTaskDependencies`
from an agent shell that exports `GIT_EDITOR`, while comparing test-run
shutdown behavior.

## Friction

Git-backed workspace tests failed before exercising their subject. `simple-git`
rejected every command with `GitPluginError: Use of "GIT_EDITOR" is not
permitted without enabling allowUnsafeEditor`.

## Cost / impact

One complete uncached workspace test run (about 80 seconds) produced failures
unrelated to the change and was repeated.

## Outcome

Rerunning the same target with `env -u GIT_EDITOR` passed 551 files and 4,411
tests.

## Evidence

Failing files included `src/resolution/sources/git/operations.test.ts`
(11 of 16 failed), `src/sharing/share-workspace.spec.ts` (4 of 4), and
`src/reconciliation/sync/preserves-configuration-and-resolutions.spec.ts`
(5 of 13).
