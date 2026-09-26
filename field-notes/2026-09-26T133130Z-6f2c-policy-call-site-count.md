---
observed_at: "2026-09-26T13:31:30Z"
session: "6f2c"
area: "CLI affected verification"
---

# Policy override test assumed the old call-site count

## Context

The product branch consolidated command boundaries and ran `pnpm run verify:affected`.

## Friction

The CLI specification test required more than 15 `withReleaseAgePosture` call sites; the consolidated implementation had 9, so the affected run stopped after one failing test.

## Cost / impact

The affected run took 3m 24s and had to be repeated after adjusting the assertion.

## Outcome

The assertion now requires at least one discovered site while checking every discovered argument for the parsed flag. The focused CLI specification passed 14 tests; broader verification remained pending at capture time.

## Evidence

`apps/cli/src/cli-flags/policy-overrides-reach-every-blocked-command.spec.ts`; affected result: 1 failed, 3379 passed; focused result: 14 passed.
