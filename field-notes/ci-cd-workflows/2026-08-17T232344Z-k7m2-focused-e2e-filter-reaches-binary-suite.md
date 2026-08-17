---
id: 2026-08-17T232344Z-k7m2
subject: ci-cd-workflows
key: focused-e2e-filter-reaches-binary-suite
observed_at: "2026-08-17T23:23:44Z"
session: release-0p27p9-k7m2
kind: gap
status: open
---

**Expected:** The documented focused-test form `pnpm nx run <project>:test --args="path"`
would verify the selected CLI E2E files and exit successfully when those files passed.
**Observed:** `pnpm nx run cli-e2e:e2e --args="src/command.e2e.test.ts
src/smoke.e2e.test.ts"` passed both selected source suites (70 tests), then forwarded
the same filters to the binary-only Vitest configuration, which found no matching
files and exited 1.
**Impact:** The focused verification result was unusable as a green gate and required
the full release CI suite to establish project-level success.
**Recovery:** The selected source and smoke assertions were confirmed passing; full CI
remained required before release preparation could continue.
**Detected by:** The focused Nx E2E target's terminal output and exit code.
**Observed factors:** The target runs both the default and binary Vitest configurations;
the binary configuration includes only `src/binary-smoke.e2e.test.ts`.
**Hypothesis:** The Nx target forwards one positional filter set to every configured
Vitest invocation without treating a no-match secondary configuration as inapplicable.
**Suggests:** Route focused filters only to matching test invocations, or let the
binary-only invocation succeed when the requested files are outside its include set.

Evidence: both requested files passed with 70/70 tests, after which the binary command
reported `No test files found, exiting with code 1` and the Nx `cli-e2e:e2e` target
failed.
