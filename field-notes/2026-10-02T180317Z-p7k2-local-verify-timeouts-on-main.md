---
observed_at: "2026-10-02T18:03:17Z"
session: "f031939c"
area: "local verification (verify:affected, vitest timeouts)"
---

# Local verify:affected fails on unchanged main from 5 s test timeouts

## Context

Verifying a publish-command change before merge with `pnpm run verify:affected`
on a 16-core workstation, at a load average of about 3 with no other suites
running.

## Friction

`verify:affected` stopped at `workspace-features:test` and `cli:test` with
dozens of failing spec files in sync, lifecycle, authoring, and linting. Every
failure was the local 5000 ms per-test timeout from `vitest.execution.ts`, and
the affected files take 25–38 s each. None of those specs exercise the changed
publish code.

A gallery snapshot update through
`nx run cli:test --args="-u src/test-support/gallery/gallery.test.ts"` ran the
whole `cli` suite instead of the gallery file. Under the same timeouts, it also
rewrote `conformance/recorded/install-failed.json` and `install-preview.json`
with shifted `operationId` values.

## Cost / impact

- Three `verify:affected` attempts failed. Several delegated agents also
  re-ran slow suites with longer timeouts to separate these failures from real
  regressions.
- A second worktree at `origin/main` with a fresh install was needed to
  establish a baseline.
- The two conformance recordings had to be restored by hand.

## Outcome

On untouched `origin/main`, two of the failing files
(`src/sync/reports-aggregate-projection-drift-at-unit-precision.spec.ts`,
`src/lifecycle/migrate-deprecated.spec.ts`) failed identically: 14 of 14
tests, about 44 s. Verification continued with `CI=true pnpm run
verify:affected`, which applies the merge queue's 20 s timeout and two-worker
profile.

## Evidence

- `vitest.execution.ts`: `testTimeout: process.env["CI"] ? 20_000 : 5_000`.
- Baseline and branch both reported `Test Files 2 failed (2)` and
  `Tests 14 failed (14)` for the two files above.
