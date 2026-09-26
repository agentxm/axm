---
observed_at: "2026-09-26T06:36:55Z"
session: "c72a"
area: "canonical publication source specification"
---

# Git-backed publication examples could not start in Vitest

## Context

The publication-source change moved the workflow decision table into a Bun root script and changed its specification harness to invoke that script.

## Friction

All six Git-backed examples in `releases-publish-through-canonical-workflow.spec.ts` stopped during fixture setup with `spawnSync git EPERM`, before the resolver ran. The same focused target passed the non-Git checks.

## Cost / impact

The repository specification run could not provide an input-bound passing receipt for the selection cases in this sandbox.

## Outcome

The published `resolve:release-source` script was exercised through a temporary local Git fixture outside Vitest. Automatic release, ordinary commit, stable recovery, bootstrap, and branch preview selections matched expected outputs; malformed subject, mismatched version, ambiguous recovery, stale source, and invalid branch ref returned nonzero without writing selection output.

## Evidence

The focused JSON report had 31 passing and six failing assertions, with each failure beginning `Error: spawnSync git EPERM`. The temporary fixture runs asserted the six output keys for the eligible paths and empty output for rejected paths.
