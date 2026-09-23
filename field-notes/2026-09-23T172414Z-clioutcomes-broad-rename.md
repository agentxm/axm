---
observed_at: "2026-09-23T17:24:14Z"
session: "clioutcomes"
area: "CLI refactor editing"
---

# Broad rename changed unrelated telemetry names

## Context

The CLI refactor introduced a returned process outcome. `CommandOutcome` was already a telemetry-summary type, so the new type needed a distinct name.

## Friction

A repository-wide text replacement also renamed `summarizeCommandOutcome` and `CommandOutcomeSummary` references in nine unrelated CLI files. Those edits did not belong to the process-outcome change.

## Cost / impact

Nine unrelated files needed restoration before typechecking the intended refactor.

## Outcome

The unrelated files were restored, and the process type was named `ProcessOutcome`.

## Evidence

`git status --short` showed changes in `apps/cli/src/operation-output.ts`, `apps/cli/src/root/shared/install-command.ts`, and other telemetry consumers immediately after the replacement; `git restore` removed them.
