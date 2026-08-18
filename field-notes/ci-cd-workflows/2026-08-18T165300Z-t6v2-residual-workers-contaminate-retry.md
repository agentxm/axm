---
id: 2026-08-18T165300Z-t6v2
subject: ci-cd-workflows
key: residual-workers-contaminate-retry
observed_at: "2026-08-18T16:53:00Z"
session: s8k2m4
kind: gap
status: open
---

**Expected:** A trusted CI job starting after a canceled predecessor should run the repository's full verification from a clean execution context.
**Observed:** The runner start hook reported five residual Vitest workers from the reused checkout, and the new root verification exited before tests because Nx detected a stale recursive invocation chain.
**Impact:** Required CI remained red despite the native Windows lifecycle passing, requiring a failed-job rerun before the work item could be accepted.
**Recovery:** Rerun the failed trusted job after the predecessor run and its residual work have ended.
**Detected by:** Inspection of the completed trusted-job log after its generic failure annotation provided no cause.
**Observed factors:** The earlier workflow was canceled while the trusted verifier was running; the runner hooks operate in report-only mode and did not terminate residual workers.
**Hypothesis:** Processes surviving cancellation retained Nx task-chain state in the reused workspace and contaminated the next full verification invocation.
**Suggests:** Make canceled-run cleanup terminate verified residual repository workers before a trusted runner accepts another job for the same checkout.

Evidence: The job-started hook reported five `cwd+vitest` candidates, and Nx then reported `axm:verify -> axm:ci -> cli-e2e:e2e -> axm:verify` before any test artifacts existed.
