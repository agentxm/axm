---
observed_at: "2026-09-30T15:57:45Z"
session: "v2n5"
area: "macOS native filesystem verification"
---

# APFS cleanup lost its mount identity

## Context

The Intel macOS CI job passed its normal binary smoke suite and its native
case-sensitive APFS lifecycle check.

## Friction

Cleanup could not eject the image because the device was busy. The forced retry
used the mount point after the first attempt had unmounted it, then failed with
`No such file or directory`.

## Cost / impact

The job failed after its product checks passed, requiring a workflow correction
and another hosted verification run.

## Outcome

Cleanup now retains the attached device from structured `hdiutil` output for
both detach attempts. The workflow tests cover partial unmount recovery,
cleanup failure, and preservation of the original test failure; 33 focused
tests passed locally. Native macOS confirmation remains pending.

## Evidence

`.github/workflows/ci.yml` case-sensitive APFS step and executable shell
regressions in `scripts/ci-workflow.test.ts`.
