---
id: 2026-08-25T002329Z-k7m3
subject: axm-cli-interactions
key: source-cli-stale-dist-export
observed_at: "2026-08-25T00:23:29Z"
session: zc0824
kind: blocked
status: open
---

**Expected:** `pnpm axm agents capabilities <id> --json` should run the documented source CLI and print the catalog row.
**Observed:** Five invocations failed before command dispatch with `SyntaxError: Export named 'PlanExecutionReasonSchema' not found in module 'packages/core/dist/src/unstable/plan/index.js'` and exit code 1.
**Impact:** Live capability inspection was unavailable; this read-only analysis continued from catalog and setup-scope source. Five commands produced no usable output.
**Recovery:** Used repository source as evidence; no rebuild was attempted because the task is read-only.
**Detected by:** Direct invocation through the documented `pnpm axm` script.
**Observed factors:** Bun 1.3.14 on macOS arm64; source CLI imported `packages/core/dist`; all five agent IDs failed identically.
**Hypothesis:** Built core output is stale relative to CLI source.

Evidence: `pnpm axm agents capabilities codex --json` exited 1 with the missing named-export error; claude-code, cursor, roo, and opencode repeated the same failure.
