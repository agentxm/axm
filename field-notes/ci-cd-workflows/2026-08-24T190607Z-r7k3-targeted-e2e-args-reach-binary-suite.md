---
id: 2026-08-24T190607Z-r7k3
subject: ci-cd-workflows
key: targeted-e2e-args-reach-binary-suite
observed_at: "2026-08-24T19:06:07Z"
session: 01a03512-fee3-79a2-8e87-0d51cd2476bb
kind: gap
status: open
---

**Expected:** A file-filtered `cli-e2e:e2e` invocation would run the requested E2E file and report its passing result.
**Observed:** The requested activation-lifecycle file passed, then Nx forwarded the same file argument to the target's binary-smoke Vitest command; that runner rejected the file because its include pattern only permits `binary-smoke.e2e.test.ts` and made the overall target fail.
**Impact:** A focused E2E check produces a false-negative target result and requires an unfiltered target run for final verification; elapsed time was not measured.
**Recovery:** Run the unfiltered affected verification gate, which supplies no incompatible file argument to the binary-smoke runner.
**Detected by:** The second Vitest invocation printed `No test files found` after the requested E2E file had passed both tests.
**Observed factors:** The repository-defined Nx target runs both ordinary and binary-smoke E2E commands; the requested source file belongs only to the ordinary suite; the first invocation passed.
**Hypothesis:** The target applies `--args` uniformly to both commands even though they use disjoint include patterns.
**Suggests:** Give the two E2E suites separate filter inputs or make the binary-smoke command ignore ordinary-suite file filters.

Evidence: Command `pnpm nx run cli-e2e:e2e --args='src/activation-lifecycle.e2e.test.ts'`; ordinary suite 2/2 passed; binary suite reported no matching files.
