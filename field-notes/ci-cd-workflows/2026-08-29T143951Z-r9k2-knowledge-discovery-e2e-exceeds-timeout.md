---
id: 2026-08-29T143951Z-r9k2
subject: ci-cd-workflows
key: knowledge-discovery-e2e-exceeds-timeout
observed_at: "2026-08-29T14:39:51Z"
session: r9k2
kind: failure
status: open
---

**Expected:** The multi-command Knowledge discovery scenario would complete
within its declared timeout on the supported release-PR runner.
**Observed:** Two consecutive release-PR verification runs reached the test's
explicit 60-second timeout at `knowledge.e2e.test.ts:655` after more than 420
other E2E tests passed.
**Impact:** The required release gate failed after roughly 20 minutes on each
attempt despite the affected product behavior passing local pre-push
verification.
**Recovery:** Raised this scenario's timeout to 120 seconds, matching the
existing budget for another long-running CLI E2E scenario.
**Detected by:** Monitoring the required GitHub Actions release gate and
inspecting its test annotation after each attempt.
**Observed factors:** Both failures occurred at the same source location and
timeout boundary; the scenario launches many independent CLI subprocesses; the
release changes do not alter Knowledge discovery behavior.
**Suggests:** Size multi-command E2E budgets from hosted-runner measurements and
split scenarios when orchestration approaches the budget.

Evidence: GitHub Actions runs `33254670462` and `33257212830` both reported
`packages/cli-e2e/src/knowledge.e2e.test.ts:655` timing out after 60 seconds.
