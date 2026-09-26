---
observed_at: "2026-09-26T03:03:19Z"
session: "c72a"
area: "AXM workspace manager tests"
---

# Manager test fixtures read canonical trees before creating them

## Context

While verifying this consolidation's shared acquisition helper, I ran the workspace manager test directories through the repository's Nx test target.

## Friction

Eight tests failed during fixture setup with `ENOENT` while `computeMaterializedTreeIntegritySync` scanned absent canonical directories under `agent_extensions/path/@acme`. Six were HookManager tests and two were KnowledgeManager tests. Their manager operations had not yet run.

## Cost / impact

The combined manager run reported 213 passed and eight failed tests; the fixture failures prevent a clean manager-suite result for this change.

## Outcome

The helper's 52 acquisition/materialization tests and focused lifecycle cases were run separately. The eight fixture failures remain.

## Evidence

`/tmp/axm-work-pos44-managers.json`; `packages/core/workspace/src/hooks/manager.test.ts:121`; `packages/core/workspace/src/materialization/test-helpers.ts:52`.
