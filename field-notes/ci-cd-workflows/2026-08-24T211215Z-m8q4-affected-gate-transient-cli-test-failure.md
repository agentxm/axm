---
id: 2026-08-24T211215Z-m8q4
subject: ci-cd-workflows
key: affected-gate-transient-cli-test-failure
observed_at: "2026-08-24T21:12:15Z"
session: a7m2p9
kind: workaround
status: open
---

**Expected:** `pnpm run ci:affected` and a subsequent repository-targeted CLI
test run would report the same deterministic CLI failures for the unchanged
checkout.
**Observed:** The affected gate reported the unknown-flag parser test receiving
exit 10 instead of exit 2 after a `Cancelled by SIGTERM` message; the identical
test passed in both a focused rerun and the full `cli:test` rerun. The separate
macOS temporary-path assertion failed consistently.
**Impact:** Distinguishing a transient failure from the reproducible failure
required two additional repository-targeted test invocations; elapsed time was
not measured.
**Recovery:** Reran the unknown-flag test through `cli:test` by name, then ran
the full `cli:test` target; both confirmed the unknown-flag contract passes.
**Detected by:** Comparing the affected-gate output with the focused and full
CLI test results.
**Observed factors:** The worktree and source were unchanged between runs; the
affected gate ran project targets concurrently; the focused and full CLI-only
runs did not reproduce the SIGTERM or exit-10 result.
**Hypothesis:** Concurrent affected-target execution exposed process-level
signal or exit-state interference; the cause is unknown.

Evidence: `pnpm run ci:affected` reported `src/app.test.ts` expected exit 2 but
received exit 10 after `Cancelled by SIGTERM`; both subsequent
`pnpm nx run cli:test` invocations passed that test.
