---
observed_at: "2026-10-03T00:44:59Z"
session: "s8m2"
area: "Local verification"
---

# Shared-workspace test runs exceeded local time budgets

## Context

The subagent change was verified in an isolated worktree on a VM with other active worktrees.

## Friction

The default affected-workspace gate stopped on six five-second timeouts in unchanged Hook, Rule, and Knowledge tests. Repeating the PR workflow with the repository's CI execution profile passed all 136 extension-manager tests. The full kernel run then reported three MCP/instruction timeouts and four outdated discovery fixtures among 2,047 tests; 2,037 passed and three were skipped.

## Outcome

The discovery fixtures were updated and all 14 focused discovery tests passed. Focused subagent process, ownership, currency, acquisition, and update-refusal cases passed with bounded test timeout overrides. Full verification results remain distinct from those focused passes.
