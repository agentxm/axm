---
observed_at: "2026-10-03T04:36:06.970324+00:00"
session: "s7q4"
area: "verification reporting"
---

# Allure failed while reporting successful effects flipped into test failures

## Context

New acquisition regression tests were run against the implementation before applying their fixes. Some checks used `Effect.flip` to require a typed failure.

## Friction

The old implementation succeeded, so a void success became an undefined failure. Allure raised `Cannot destructure property 'message' of 'error' as it is undefined` while reporting the negative run. Array-valued successes also produced unclear failure output.

## Cost / impact

The run reported six failed tests plus an unhandled reporter error. One additional focused run was needed to obtain clean failure evidence.

## Outcome

The affected new tests now inspect `Effect.result` with explicit failure-shape assertions. The repeated run reproduced all six failures without an unhandled reporter error.
