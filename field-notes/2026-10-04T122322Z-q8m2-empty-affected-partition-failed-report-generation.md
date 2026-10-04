---
observed_at: "2026-10-04T12:23:22Z"
session: "q8m2"
area: "Hosted source partition reporting"
---

# Empty affected partition failed report generation

## Context

The first source-budget PR partitioned affected source verification into workspace features and remaining projects. This workflow-only change selected no workspace-feature tasks.

## Friction

Nx reported “No tasks were run,” then the unconditional report target failed with “No test results directories found matching pattern: test-results/*/allure-results.” The workspace-feature partition failed despite having no selected test work.

## Cost / impact

The PR gate could not pass. The retained source-job log established the empty selection and report failure. `gh run view --job --log` refused to retrieve the completed job while the overall run remained active; the documented job-log API retrieved it.

## Outcome

The failed job was preserved, and a correction was scoped to expected test selection before report generation. The separate full-workspace verification remained active.

## Evidence

[CI run 37201790354](https://github.com/agentxm/axm/actions/runs/37201790354), workspace-feature job `111434900947`.
