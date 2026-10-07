---
observed_at: "2026-10-07T16:13:02.794778+00:00"
session: "publication-file-selection-p7v3"
area: "axm-cli-interactions"
---

# Installed CLI cannot read the source workspace lockfile

## Context

Running the AXM read-only preflight before revising the bundled publication guidance in an isolated source worktree.

## Friction

`mise exec -- axm --version` returned 0.39.0. `axm lint --json` refused the workspace because its lockfile declares version 11 while that CLI supports version 10.

## Cost / impact

The installed CLI could not perform the required workspace inspection. The source CLI runbook and repository workflow were used to continue.

## Outcome

`pnpm run axm:local lint --json` ran with source version 0.42.0 and reported compatible bundled skill version 0.42.0, zero errors, and thirteen warnings.
