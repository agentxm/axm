---
observed_at: "2026-09-25T14:51:10Z"
session: "ar7k"
area: "local verification: Nx target graph in a shared worktree"
---

# Another agent's in-flight edit blocked typecheck and tests through the build gate

## Context

Implementing one work package (a shared `acceptedResolutionFor` builder and
one `InstallStateMissing` failure in `packages/core/workspace`) while other
agents edited other files of the same worktree concurrently. The package's
`typecheck` and `test` targets both depend on `workspace:build`.

## Friction

After the edits were complete, `pnpm exec nx run workspace:typecheck` reported
a single error in `packages/core/workspace/src/packs/manager.ts:126` (a
`PackLockEntry` now requiring `sourceRoot` after another agent's change to
`desired-state/lockfile/schema.ts`). That file was out of scope for this work
package. Because the build failed there, the `typecheck` task itself was
skipped ("Tasks not run because their dependencies failed") and the `test`
target could not run either, so the finished work package could not be
verified beyond `workspace:lint`.

## Cost / impact

Three typecheck runs that ended at the same foreign error, one blocking
message to the team lead, and a polling loop that waited for the build to
return to green before the spec and manager tests could run. Test files were
not type-checked during that window because the build's `tsconfig.lib.json`
excludes them.

## Outcome

The other agent's change landed a few minutes later; the polling loop observed
`workspace:build` succeeding and verification resumed without further change
on this side.

## Evidence

- `pnpm exec nx run workspace:typecheck` output: `packs/manager.ts:126:7 -
error TS2322 ... Property 'sourceRoot' is missing` followed by `Tasks not
run because their dependencies failed`.
- `pnpm exec nx run workspace:lint` succeeded in the same window.

## Existing context

The work-package brief anticipated foreign typecheck errors ("re-run later and
only fix errors in your own files") but not that a foreign error would also
prevent the test target from running at all.
