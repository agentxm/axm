---
observed_at: "2026-09-24T21:40:00Z"
session: "w4c1"
area: "codebase: apps/cli app-error barrel inside an import cycle"
---

# Importing a moved schema through the app-error barrel evaluates as undefined

## Context

Replacing the hand-written cause-chain interface with one schema-derived type:
`SerializedErrorCauseSchema` defined in `apps/cli/src/app-error/cause-chain.ts`
and consumed by `cli-runtime/json-envelope.ts` and `operation-output.ts`.

## Friction

Importing the schema through `app-error/index.ts` made two test files fail at
module evaluation with `TypeError: Cannot read properties of undefined (reading
'ast')` at the `Schema.Array(SerializedErrorCauseSchema)` field. The barrel
sits in an import cycle (app-error/index → view → screen → … → json-envelope →
app-error/index), so the binding was still uninitialized when json-envelope
evaluated. The typecheck passed; only test execution revealed it.

## Cost / impact

One failed focused test run and one extra edit-and-rerun cycle.

## Outcome

Both consumers import `../app-error/cause-chain.js` directly, with a comment
naming the cycle; tests passed on the next run.

## Evidence

Focused run of `src/cli-runtime/json-envelope.test.ts` and
`src/operation-exit-code.test.ts` failed with the TypeError; the same run passed
after the direct import.

## Existing context

`json-envelope.ts` already imported `toAppError` from
`../app-error/conversions.js` directly rather than via the barrel, consistent
with the same constraint.
