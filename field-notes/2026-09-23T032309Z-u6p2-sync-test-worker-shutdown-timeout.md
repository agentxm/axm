---
observed_at: "2026-09-23T03:23:09Z"
session: "u6p2"
area: "CLI verification"
---

# Sync test worker timed out during shutdown

## Context

Ran `pnpm run verify:affected` while replacing process-global file-write lock
tables with invocation-owned coordination.

## Friction

The CLI target reported all 3,169 tests passing, then Vitest printed a timeout
terminating the forks worker for unchanged
`apps/cli/src/root/sync/projection-fact-consumers.test.ts`.

## Outcome

The CLI target wrote its test report and verification continued. The cause of
the shutdown timeout was not established.
