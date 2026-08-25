---
id: 2026-08-25T202637Z-q4m7
subject: ci-cd-workflows
key: release-prepare-inherits-registry-override
observed_at: "2026-08-25T20:26:37Z"
session: m4q8
kind: workaround
status: open
---

**Expected:** `pnpm release:prepare` should keep its pre-version e2e fixtures
isolated from ambient Registry configuration while using production only for
the explicit AXM-skill publish preview.
**Observed:** With production `AXM_REGISTRY_LOCATION` and `AXM_REGISTRY_URL`
exported for the release command, the nested e2e suite inherited them and
`signal-interruption.e2e.test.ts` tried to resolve its fixture skill from the
production Registry. The release wrapper reported only that `axm:verify`
failed; the JUnit report retained the exact `not_found` failure.
**Impact:** Release preparation required two failed three-minute attempts plus
one successful three-minute diagnostic run.
**Recovery:** Inspected `test-results/cli-e2e/junit.xml`, confirmed that
`release-prepare.ts` passes `--registry-url` only to the production preview,
and removed the unnecessary ambient Registry overrides for the retry.
**Detected by:** Comparing the failed release environment with the successful
unchanged verify run and inspecting the fresh JUnit failure.
**Observed factors:** The checkout remained clean; the direct verify without
the production overrides passed; the failing test expected a local fixture
skill named `@test/skills/interrupt`.
**Hypothesis:** The release pre-version command and e2e harness do not sanitize
ambient Registry overrides before starting fixture-backed CLI subprocesses.
**Suggests:** Make fixture-backed e2e commands set their Registry endpoint
explicitly, or sanitize release-only Registry variables before the pre-version
gate.

Evidence: `test-results/cli-e2e/junit.xml` recorded one failure with
`Skill "@test/skills/interrupt" was not found in configured registries`; the
same full verify target passed without the production Registry exports.
