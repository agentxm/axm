---
observed_at: "2026-09-26T04:21:06Z"
session: "unknown"
area: "workspace test fixtures"
---

# Standalone manager tests could not reach projection assertions

## Context

The this consolidation instruction-alias change was being checked with the workspace test target across Hooks, Knowledge, Instructions, and Reconciliation.

## Friction

Eight HookManager and KnowledgeManager tests failed while their setup computed tree integrity: the expected canonical package directory under a temporary workspace did not exist. These failures occurred before the changed projection writer was exercised.

## Cost / impact

The eight tests did not establish regression evidence for those standalone manager paths. The run also passed 309 other tests.

## Outcome

Focused lifecycle and instruction-alias specifications passed. The broad manager run remained failed.

## Evidence

`pnpm exec nx run workspace:test --excludeTaskDependencies --args="src/hooks src/knowledge src/instructions src/reconciliation --reporter=json --outputFile=/tmp/axm-work-step51-other-regression.json"` reported `ENOENT: no such file or directory, scandir '/tmp/axm-hook-manager-.../agent_extensions/path/@acme/hooks/...'` and the corresponding Knowledge path in `packages/core/workspace/src/hooks/manager.test.ts:121` and `packages/core/workspace/src/knowledge/manager.test.ts`.
