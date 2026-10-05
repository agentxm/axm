---
observed_at: "2026-10-05T17:39:54.345808+00:00"
session: "e4r5"
area: "axm update"
---

# Update preview reports ready units that fail during apply

## Context

Updating configured extensions in a new worktree using installed AXM 0.39.0. Workspace lint reported zero errors and compatible CLI/skill versions.

## Friction

`axm update --preview --json` reported outcome `previewed`, 14 ready units and zero blocked/failed units. Two unit IDs ended in `planning-error`. Applying returned `partial`: the direct `knowledge/agentxm` and `knowledge/product-engineering` units failed with `Native locations cannot realize the proposed knowledge content`.

## Outcome

Two pack units committed, ten units were unchanged and two failed. The Effect knowledge pack updated successfully. Workspace sync preview is the next diagnostic step.
