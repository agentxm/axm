---
id: 2026-08-18T163900Z-r5q9
subject: ci-cd-workflows
key: nongit-gitignore-failure-injection
observed_at: "2026-08-18T16:39:00Z"
session: s8k2m4
kind: gap
status: open
---

**Expected:** The Windows lifecycle test's `.gitignore` directory obstacle should make instruction enable fail so transaction rollback can be verified.
**Observed:** Instruction enable exited successfully because the temporary workspace was not Git-managed and AXM therefore skipped `.gitignore` reconciliation.
**Impact:** One additional Windows CI run failed after the product path defect was fixed, delaying acceptance of the platform lane.
**Recovery:** Inject the obstacle at the managed-copy instruction target and assert that rollback preserves it.
**Detected by:** The published Windows JUnit assertion showed the expected nonzero exit code was zero after all earlier lifecycle assertions passed.
**Observed factors:** The test creates a temporary workspace without Git initialization; `.gitignore` writes are conditional on Git-managed workspace detection.
**Hypothesis:** The fixture assumed `.gitignore` was always a mutation target without establishing the Git-managed precondition.
**Suggests:** Keep injected failures on unconditional mutation targets unless the test explicitly establishes the conditional precondition.

Evidence: CI run 32161092139 reached line 270 of the Windows lifecycle test and reported `expected +0 not to be +0`; the command implementation skips gitignore reconciliation when `isGitManaged` is false.
