---
observed_at: "2026-09-30T10:45:58Z"
session: "tn5h"
area: "AXM affected verification"
---

# Affected verification failed in Git discovery interruption coverage

## Context

Ran `pnpm run verify:affected` for the native-location preview reporting changes,
with a dedicated `TMPDIR` and affected base
`682af4fe7a3ce8a42547ecc494e2affc2905c646`.

## Friction

The test `interrupts a locator checkout child and removes its temporary directory`
in `src/lifecycle/install/git-discovery.test.ts` failed at line 226: the observed
checkout parent was `.` instead of the configured temporary directory.

## Cost / impact

The workflow took 12 minutes 24 seconds and exited with code 1. The
workspace-features suite reported 350 passing files, one failing file, 2820
passing tests, one failing test, and one skipped test.

## Outcome

The current changes remain unaccepted work in progress. No retry or corrective
change was performed before this capture.

## Evidence

Verification log: `/tmp/native-preview-verify-affected.log`.
