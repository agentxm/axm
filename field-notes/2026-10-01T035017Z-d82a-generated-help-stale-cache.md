---
observed_at: "2026-10-01T03:50:17Z"
session: "d82a"
area: "Nx generated help inputs"
---

# Cached help retained the previous settings schema

## Context

Preparing the agent-catalog refresh for required pull-request verification.

## Friction

CI's generated-output guard found three stale artifacts after local generation.
Regenerating two still left help topics embedding the previous agent-ID order.
The help target declared schemas as ordinary file inputs, which Nx could hash
before prerequisite generation completed.

## Outcome

The help target now hashes prerequisite schema and Markdown outputs through
`dependentTasksOutputFiles`. Fresh uncached generation passes, and all 24
task-interface conformance checks pass, including the added dependency check.

## Evidence

PR #500 run 36811299569 failed its generated-output prerequisite. The corrected
configuration is in `apps/cli/project.json`; the regression check is in
`scripts/repository-task-interface.test.ts`.
