---
observed_at: "2026-10-03T00:36:28.084104+00:00"
session: "unknown"
area: "local PR verification"
---

# Shared-host verification needed a single-worker retry

## Context

The full PR gate ran serial Nx targets with the existing CI profile and a dedicated temporary directory. Another worktree was also running tests on the host.

## Friction

Three projection-currency specification cases exceeded the 20-second CI timeout. The same file had passed a focused single-worker run. The cause of the full-run timeouts was not established.

## Cost / impact

The full gate could no longer pass. Its timeout evidence was retained, and the affected run was stopped with SIGINT before completion.

## Outcome

Restarted `pnpm run verify:pr` with the installed Vitest's `VITEST_MAX_WORKERS=1` override. Test selection and timeout limits were unchanged; the retry was still running when captured.
