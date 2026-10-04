---
observed_at: "2026-10-04T08:14:16Z"
session: "q8m2"
area: "State document-loader regression verification"
---

# An absent authored directory weakened the initial scan regression fixture

## Context

A direct document-loader change added a regression check that refused unrelated directory enumeration. The initial fixture had no existing authored directory, and the focused check passed before complete PR verification began.

## Friction

Review found that the fixture needed an existing authored directory to exercise the unwanted scan. The complete verification workflow was interrupted during static verification and returned exit 130.

## Cost / impact

The fixture required an added authored directory, a negative-control run with the preceding document-reader implementation, another focused run, and a restart of complete PR verification.

## Outcome

The strengthened check failed with the preceding implementation at the directory-enumeration refusal. It passed after restoring the direct loaders; all 37 focused cases passed. Complete verification restarted against the final source.

## Evidence

`packages/core/workspace-kernel/src/workspace-state/workspace/state-cells.test.ts`; negative control: `Document reads must not enumerate unrelated directories`.
