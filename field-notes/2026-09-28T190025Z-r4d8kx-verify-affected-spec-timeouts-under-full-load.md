---
observed_at: "2026-09-28T19:00:25Z"
session: "28d6e2eb"
area: "verify:affected workflow, workspace-features executable specifications"
---

# Feature specs hit the 5000ms timeout only under the full verify:affected run

## Context

Running `pnpm run verify:affected` as the merge gate for a change that touched
the kernel's desired-state evaluation and its consumers across three packages.

## Friction

Each of two consecutive full runs failed `workspace-features:test` on one
`it.effect` specification with `Error: Test timed out in 5000ms.`, a different
specification each time, while `cli:test`, `workspace-kernel:test`, and
`extension-kinds:test` ran concurrently. Both runs also logged several
`[vitest-pool]: Worker forks emitted error ... SIGTERM` lines for unrelated
workspace-features files after the timeout. Each timed-out specification passed
when run alone, and the whole `workspace-features:test` target passed on its
own with `--skip-nx-cache`.

## Cost / impact

Two full `verify:affected` runs reported failure for a change whose tests pass
in isolation; three extra targeted reruns (two single files, one full package
target) were needed to establish that the gate result was load-related.

## Outcome

Proceeded on the isolated green results plus the pull request's CI; no test or
timeout was changed.

## Evidence

Timed out in run 1: `src/sync/reports-aggregate-projection-drift-at-unit-precision.spec.ts > reconciles the whole knowledge region when sync selects the contributors' type`.
Timed out in run 2: `src/lifecycle/install/records-direct-intent.spec.ts > refuses to replay an accepted Pack member a later direct pin excludes, naming the update route`.
Both: `Error: Test timed out in 5000ms.`; isolated reruns `1 passed`; full package rerun `346 passed (346)`.

## Existing context

An earlier note in this directory records `it.effect` specifications timing
out for a different reason (offline Registry retry backoff under the test
clock); no shared cause was established for this occurrence.
