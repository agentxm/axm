---
id: 2026-08-25T202637Z-q4m7
subject: ci-cd-workflows
key: release-prepare-transient-verify-failure
observed_at: "2026-08-25T20:26:37Z"
session: m4q8
kind: workaround
status: open
---

**Expected:** `pnpm release:prepare` should complete its pre-version
`axm:verify` gate for an unchanged checkout that had already passed the full CI
suite.
**Observed:** The release wrapper reported only that `axm:verify` failed after
about three minutes; an immediate verbose invocation of the same authoritative
target passed without source changes in 3 minutes 7 seconds.
**Impact:** Release preparation required one full additional verify run and a
retry; elapsed delay was about six minutes.
**Recovery:** Confirmed that versioning had not begun, reran
`pnpm exec nx run axm:verify --outputStyle=static --verbose`, and used its green
result as the prerequisite for a clean release retry.
**Detected by:** Comparing the failed release-preparation exit with the
unchanged worktree and successful authoritative verbose rerun.
**Observed factors:** The first wrapper output did not retain the underlying
task failure; the checkout remained clean; the rerun exercised generation,
lint, typecheck, build, unit tests, e2e, script tests, and repository verifiers.
**Hypothesis:** The pre-version gate encountered a transient test or process
failure whose actionable output was hidden by nested Nx buffering.
**Suggests:** Preserve the first failing nested task and its diagnostic tail in
release-preparation output.

Evidence: `pnpm release:prepare` exited 1 after reporting `axm:verify` failed;
the unchanged verbose `axm:verify` rerun exited 0 in 3 minutes 7 seconds.
