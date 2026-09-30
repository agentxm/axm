---
observed_at: "2026-09-30T14:59:17.105775+00:00"
session: "t9g3"
area: "GitHub Actions cache warming"
---

# Conditional source warming omitted native profile setup

## Context

Push cache warming was scoped so only Linux x64 runs the source phase, while other platforms retain native compilation.

## Friction

The conditional source phase was the only step creating the profile directory. The unconditional native phase copied its report into that directory, so lanes skipping source warming lacked a prerequisite.

## Cost / impact

Independent review found the dependency before rollout. A fresh-directory reproduction of the actual native shell block, with compilation stubbed, failed before the correction.

## Outcome

The native phase now creates its own profile directory. The same reproduction succeeds and preserves the native report. Hosted platform execution remains a separate verification obligation.
