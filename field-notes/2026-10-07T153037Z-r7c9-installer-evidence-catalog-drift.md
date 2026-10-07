---
observed_at: "2026-10-07T15:30:37Z"
session: "rci-r7c9"
area: "generated specification evidence"
---

# Installer evidence prose left the generated catalog stale

After the installer execution binding's rationale changed, PR CI run
37642632580 failed its prerequisite gate with generated drift in
`specifications/catalog.md`. Local `verify:affected` had passed, but the full
PR prerequisite workflow had not been run before that push.

Regenerating through `axm:generate:specification-catalog` changed four bound
evidence descriptions. `verify:pr:preflight` then passed locally, including
fresh generation, synchronization, workflow validation, and formatting checks.
The failure required another catalog update and hosted verification cycle.
