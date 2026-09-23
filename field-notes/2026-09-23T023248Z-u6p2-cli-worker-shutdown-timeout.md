---
observed_at: "2026-09-23T02:32:48Z"
session: "u6p2"
area: "CLI and workspace verification"
---

# Test workers timed out during shutdown

## Context

Ran `pnpm run verify:pr` while moving environment helpers and their consumers
to injected configuration providers.

## Friction

The CLI test target reported 243 passing files and 3,169 passing tests, then
Vitest printed a timeout terminating the forks worker for
`apps/cli/src/screen/interruption-fallback.test.ts`. That file was unchanged.
The workspace target later reported 4,397 passing tests and two skipped tests,
then printed the same warning for unchanged
`packages/core/workspace/src/mcp-connections/lifecycle/operations/chrome-devtools-live-smoke.test.ts`.

## Cost / impact

The shutdown warnings required checking whether the targets had failed.
Their causes were not established.

## Outcome

Both test targets succeeded. The verification workflow passed its source and
artifact checks and continued to end-to-end tests.
