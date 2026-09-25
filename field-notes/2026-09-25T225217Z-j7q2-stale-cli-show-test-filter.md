---
observed_at: "2026-09-25T22:52:17Z"
session: "01a0d9de-cc8e-7ca0-b584-d186f30c10c3"
area: "workspace lock-entry verification guidance"
---

# CLI show test filter named no files

## Context

The lock-entry consolidation verification called for `pnpm exec nx run cli:test --args="src/root/show"`.

## Friction

Vitest reported `No test files found` for that filter and exited with code 1, so the requested command ran no show tests.

## Cost / impact

The failed target took 2.9 seconds and required a second CLI test invocation.

## Outcome

The show tests were found under `src/root/shared` and `src/root/packs`. Running the three relevant files by exact path passed all 19 tests.

## Evidence

The failed output said `filter: src/root/show` and `No test files found`. The passing files were `src/root/shared/extension-show.test.ts`, `src/root/shared/type-shows-report-missing-entries.spec.ts`, and `src/root/packs/show.test.ts`.
