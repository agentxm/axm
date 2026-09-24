---
observed_at: "2026-09-23T23:56:00Z"
session: "f6efa5b7-6d4a-4069-9285-9b1fa640211c"
area: "targeted update of a Pack member with a new direct pin"
---

# Targeted update failed after a hand-written bare-locator pin

## Context

A specification example pinned a shared member of two accepted Packs by
writing `@acme/skills/review@1.1.0` into `axm.json`, then ran
`axm update @acme/skills/review` as the recovery route the new refusal names.

## Friction

The targeted update's one unit failed with `Targeted update changed desired
ownership or owning pack evidence (internal)`. Writing the pin in the form
install records, `test:@acme/skills/review@1.1.0`, made the same update apply.

## Cost / impact

One failed example run and one diagnostic run that printed the update result.

## Outcome

The example writes the recorded source form. Why the bare locator fails was
not investigated.

## Evidence

Failing unit label `@acme/skills/review`, state `failed`, detail as quoted
above. Part 1's shared-member update example also re-pins "in the form install
recorded".
