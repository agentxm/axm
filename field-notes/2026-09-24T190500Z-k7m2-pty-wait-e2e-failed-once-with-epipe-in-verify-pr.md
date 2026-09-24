---
observed_at: "2026-09-24T19:05:00Z"
session: "k7m2"
area: "verify:pr e2e"
---

# Pseudo-terminal wait e2e failed once with EPIPE during verify:pr

## Context

Running `pnpm run verify:pr` for the activation consolidation, after the
source-hygiene inventory fix. The change touches no terminal or sign-in code.

## Friction

`cli-e2e:e2e-main` failed on
`src/interactive-terminal.e2e.test.ts` > "shows the countdown and its keys,
and hands the terminal back when it is stopped" with `EPIPE: broken pipe,
send` in the transcript and `expect(opened?.matched).toBe(true)` false. The
bail stopped `cli-e2e:e2e`, `binary-smoke`, and `install-suite` from running.

## Cost / impact

One pre-merge verification pass lost after its source stage had passed; a
targeted rerun of the file, then a full affected e2e rerun.

## Outcome

The file passed on its own (12 tests). The affected e2e suites were rerun to
complete verification.

## Evidence

- `src/interactive-terminal.e2e.test.ts (12 tests | 1 failed) 14352ms`
- Rerun: `Test Files 1 passed (1)`, `Tests 12 passed (12)`
