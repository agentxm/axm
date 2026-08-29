---
id: 2026-08-29T151725Z-r9k2
subject: ci-cd-workflows
key: knowledge-lifecycle-e2e-exceeds-timeout
observed_at: "2026-08-29T15:17:25Z"
session: r9k2
kind: failure
status: open
---

**Expected:** The multi-command Knowledge lifecycle scenario would complete
within its declared timeout on the supported release-PR runner.
**Observed:** After the adjacent discovery scenario received a 120-second
budget, the next release-PR verification run reached this scenario's explicit
60-second timeout at `knowledge.e2e.test.ts:655` after 424 other E2E tests
passed.
**Impact:** The required release gate failed after roughly 20 minutes despite
the affected product behavior passing local pre-push verification.
**Recovery:** Raised this scenario's timeout to 120 seconds, matching the
adjacent long-running Knowledge scenario.
**Detected by:** Monitoring the required GitHub Actions release gate and
inspecting its failed-job log.
**Observed factors:** The scenario launches many independent CLI subprocesses;
the hosted suite took about 18 minutes overall; the release changes do not alter
this Knowledge lifecycle behavior.
**Suggests:** Treat these multi-command Knowledge scenarios as a group when
sizing hosted-runner budgets, and split them if their orchestration remains near
the budget.

Evidence: GitHub Actions run `33258821508` reported
`packages/cli-e2e/src/knowledge.e2e.test.ts:655` timing out after 60 seconds.
