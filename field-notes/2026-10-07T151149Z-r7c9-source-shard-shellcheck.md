---
observed_at: "2026-10-07T15:11:49Z"
session: "rci-r7c9"
area: "source CI verification"
---

# Source shard wrapper triggered shellcheck

## Context

A release tooling change split source verification into native feature shards,
a CLI partition, and remaining projects. The full-workspace feature adapter
passes a quoted script to a child shell under the Allure report wrapper.

## Friction

PR CI and full branch CI failed workflow validation with SC2016 before the
non-sharded source partitions could execute. The script intentionally expands
exported workflow variables in its child shell.

## Cost / impact

The first PR and full branch runs could not establish passing verification.
Recovery required a workflow edit and fresh hosted verification.

## Outcome

Added a scoped SC2016 directive documenting child-shell expansion.
The repository workflow-validation target passed afterward; hosted verification
remained pending at capture.

## Evidence

- [PR CI](https://github.com/agentxm/axm/actions/runs/37642151785), job 112863865661:
  `ci.yml:578:9`, `SC2016: Expressions don't expand in single quotes`.
- [Full branch CI](https://github.com/agentxm/axm/actions/runs/37642183610),
  job 112864030590 failed the same workflow-validation target.
