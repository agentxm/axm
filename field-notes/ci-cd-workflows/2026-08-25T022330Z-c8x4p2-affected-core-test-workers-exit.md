---
id: 2026-08-25T022330Z-c8x4p2
subject: ci-cd-workflows
key: affected-core-test-workers-exit
observed_at: "2026-08-25T02:23:30Z"
session: c8x4p2
kind: blocked
status: open
---

**Expected:** The repository's affected verification target should complete its
`core:test` run after generation, formatting, lint, typecheck, and build passed.
**Observed:** Vitest reported two unhandled `vitest-pool` errors because two
worker forks exited unexpectedly; 122 test files and 1,127 tests passed, no
assertion failure was reported, and the target exited non-zero.
**Impact:** The third merge-commit attempt failed after roughly one minute of
verification; deterministic completion remained unknown pending an isolated
repository-targeted rerun.
**Recovery:** Rerun `core:test` through its repository target in isolation;
recovery had not yet run when captured.
**Detected by:** The pre-commit `axm:verify-affected` target's non-zero result
and Vitest unhandled-error summary.
**Observed factors:** The affected target ran project targets concurrently;
generation, Nx sync, format, lint, typecheck, and build had passed; the E2E
target was also active; Vitest identified no failing assertion or test file for
the two exited workers.
**Diagnostic evidence:** Failing process: `git commit --no-edit`; process exit:
1; failing target: `core:test`; error class: `vitest-pool` worker fork error;
reported counts: 122 of 124 files passed, 1,127 of 1,188 tests passed, 2
unhandled errors; request or correlation ID: not supplied; attempt count: 3;
retryability: unknown pending isolated rerun; retry stop reason: two worker
processes exited unexpectedly.
**Hypothesis:** Concurrent affected-target execution exhausted or interfered
with worker processes; the cause is unknown.

Evidence: Vitest reported `Worker exited unexpectedly` twice and no assertion
failure; Nx named only `core:test` as failed.
