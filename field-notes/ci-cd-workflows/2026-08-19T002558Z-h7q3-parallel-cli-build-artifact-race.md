---
id: 2026-08-19T002558Z-h7q3
subject: ci-cd-workflows
key: parallel-cli-build-artifact-race
observed_at: "2026-08-19T00:25:58Z"
session: s8k2m4
kind: workaround
status: open
---

**Expected:** `cli-e2e:binary-smoke` and CLI static checks could run in parallel because Nx coordinates their declared build dependencies.
**Observed:** The binary-smoke dependency build reported many transient missing `@agentxm/client-core/unstable/*` modules and exited 130 while the concurrent `cli:typecheck` dependency build succeeded; Nx marked `cli:build` flaky.
**Impact:** Distribution verification required one additional sequential binary-smoke run; elapsed delay was not measured.
**Recovery:** Rerun `cli-e2e:binary-smoke` without another CLI build in flight.
**Detected by:** Parallel local execution of `cli-e2e:binary-smoke` and the CLI typecheck/lint/format chain.
**Observed factors:** Both independent Nx invocations declared `cli:build`; they shared one worktree and build output directory; the static-check invocation completed its build successfully.
**Hypothesis:** Concurrent Nx processes clean and write the same CLI/core build outputs without cross-process coordination.
**Suggests:** Serialize independent local Nx invocations that share build outputs, or make their artifact production collision-safe.

Evidence: `cli-e2e:binary-smoke` failed in `cli:build` with transient module-resolution and derived type errors while the concurrent `cli:typecheck` invocation's `cli:build` succeeded and was reported as flaky.
