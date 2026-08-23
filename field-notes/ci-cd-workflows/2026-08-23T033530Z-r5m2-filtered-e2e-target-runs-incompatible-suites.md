---
id: 2026-08-23T033530Z-r5m2
subject: ci-cd-workflows
key: filtered-e2e-target-runs-incompatible-suites
observed_at: "2026-08-23T03:35:30Z"
session: "codex"
kind: friction
status: open
---

**Expected:** Filtering `cli-e2e:e2e` to `src/knowledge.e2e.test.ts` should run
the selected source E2E suite without unrelated suite failures.
**Observed:** The target forwarded the filter to its source, binary, and
installer Vitest configurations; the source suite passed, then the binary
configuration failed because its include pattern accepts only
`src/binary-smoke.e2e.test.ts`.
**Impact:** The focused verification reported an overall failure and required a
second invocation through the narrower `cli-e2e:e2e-main` target.
**Recovery:** Use `pnpm exec nx run cli-e2e:e2e-main -- --run
src/knowledge.e2e.test.ts` for a focused source E2E run.
**Detected by:** Nx target failure after the selected six Knowledge tests
passed.
**Observed factors:** `cli-e2e:e2e` contains three sequential Vitest commands
with different include patterns, and Nx appends extra target arguments to each
command.
**Hypothesis:** The aggregate target has no filter-aware routing across its
heterogeneous child suites.

Evidence: the binary invocation reported `No test files found` with filter
`src/knowledge.e2e.test.ts` and include `src/binary-smoke.e2e.test.ts`.
