---
observed_at: "2026-09-30T15:41:00Z"
session: "v2n5"
area: "merge queue change selection"
---

# Queue selection omitted earlier commits

## Context

Reviewing verification coverage for a merge group containing twelve commits.

## Friction

The affected base resolved to the final commit's first parent rather than the
merge group's base. Earlier CLI changes were absent from classification, so
CLI E2E, Windows lifecycle, and native binary checks were skipped.

## Cost / impact

The shortened queue run did not establish verification of the complete proposed
integration. The pull request was removed from the queue to correct selection.

## Outcome

Queue classification now selects GitHub's explicit merge-group base and head.
The focused workflow and classification tests pass, including a temporary Git
history with an earlier CLI change followed by a documentation-only commit.

## Evidence

`.github/workflows/ci.yml` affected-range selection and the multi-commit queue
regression in `scripts/ci-workflow.test.ts`; 71 focused tests passed.
