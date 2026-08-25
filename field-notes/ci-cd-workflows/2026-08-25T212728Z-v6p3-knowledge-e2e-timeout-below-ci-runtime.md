---
id: 2026-08-25T212728Z-v6p3
subject: ci-cd-workflows
key: knowledge-e2e-timeout-below-ci-runtime
observed_at: "2026-08-25T21:27:28Z"
session: m4q8
kind: failure
status: open
---

**Expected:** The source-faithful Knowledge lifecycle scenario would complete
within its declared timeout on the supported GitHub-hosted release-PR runner.
**Observed:** The unchanged release SHA failed twice at the test's explicit
30-second timeout in `knowledge.e2e.test.ts`; the preceding successful release
PR recorded the same scenario at 25.7 seconds.
**Impact:** The release gate spent 40 minutes and 53 seconds across two failed
verification jobs before the timeout boundary was confirmed as reproducible.
**Recovery:** Raised this multi-command E2E scenario's timeout to the existing
60-second convention used by neighboring Knowledge lifecycle tests; the
repository-targeted focused test passed.
**Detected by:** Comparing both failed release-PR attempts with the preceding
successful release-PR timing and the scenario's explicit timeout.
**Observed factors:** Both failures occurred at the same test and line on the
same release SHA; 422 other E2E tests passed in the first attempt; no product
code differed between attempts.
**Suggests:** Keep multi-command lifecycle-test budgets above their observed CI
runtime envelope, or split scenarios whose setup and assertions approach the
budget.

Evidence: GitHub Actions run `32897021934` attempts 1 and 2 both reported
`src/knowledge.e2e.test.ts:191` timing out after 30 seconds; release-PR run
`32827627872` completed the same scenario in 25.722736414 seconds.
