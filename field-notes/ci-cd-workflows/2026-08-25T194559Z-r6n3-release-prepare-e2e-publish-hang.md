---
id: 2026-08-25T194559Z-r6n3
subject: ci-cd-workflows
key: release-prepare-e2e-publish-hang
observed_at: "2026-08-25T19:45:59Z"
session: m4q8
kind: workaround
status: open
---

**Expected:** `pnpm release:prepare` should complete its pre-version CI gate after the same full E2E suite had already passed locally.
**Observed:** The gate stopped making progress in the `packs.e2e.ts` case that publishes `@test/skills/listable-pack-skill` to a local file Registry; its Bun subprocess remained asleep at 0% CPU for more than nine minutes.
**Impact:** Release preparation was delayed by more than ten minutes and required one interrupted attempt plus an isolated test run before a safe retry.
**Recovery:** Interrupt the still-pre-version release attempt, confirm that no release artifacts were written, and run `cli-e2e:e2e-main` for `src/packs.e2e.test.ts` with the exact test filter; the isolated test passed in 2.8 seconds.
**Detected by:** Release output stopped before versioning, followed by exact process-tree, working-directory, file-descriptor, and process-sample inspection.
**Observed factors:** The prior full AXM CI run passed; the stuck command was `skills publish @test/skills/listable-pack-skill --yes`; it had no TCP socket; its working directory was an E2E temporary workspace; all sampled Bun threads were waiting; the focused rerun passed on the first attempt.
**Diagnostic evidence:** Command surface `pnpm release:prepare`; interrupted exit code 130; child PID 20563; parent Vitest worker PID 75973; elapsed child runtime more than nine minutes; affected test `lists installed packs after install`; focused retry exit code 0 and duration 2.8 seconds; request or correlation ID not supplied.
**Hypothesis:** An intermittent subprocess-lifecycle fault stranded the local Registry publish command during the full concurrent E2E run.
**Suggests:** Give spawned CLI commands a bounded timeout that reports the exact arguments and test identity when a child stops making progress.

Evidence: Process inspection identified the exact sleeping publish child and no network activity; the same test completed successfully in isolation immediately after interruption.
