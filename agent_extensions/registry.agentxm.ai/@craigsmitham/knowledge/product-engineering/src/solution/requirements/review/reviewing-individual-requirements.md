---
type: Checklist
title: Reviewing individual requirements
description: Provides a risk-sensitive review of one requirement's authority, content, quality, relationships, and assessment basis. Use when a single requirement is reviewed before it is accepted, changed, or relied on.
tags: [review, requirement-quality, verification, validation, checklist, pe-solution]
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Reviewing individual requirements

Scale review depth to consequence, novelty, ambiguity, and change cost. Check
the record, not just the sentence.

- [ ] Identity, maturity, normative force, and decision authority are explicit.
- [ ] Sources are applicable, versioned when necessary, and distinguish fact
      from inference.
- [ ] One obligated subject, condition, and bounded obligation are identifiable.
- [ ] Terms, quantities, units, scope, and exceptions are unambiguous for the
      intended audience.
- [ ] The requirement is necessary, feasible, and free of accidental design.
- [ ] Independently decidable obligations are separated; atomic rules remain intact.
- [ ] Conflicts, dependencies, assumptions, and open decisions are visible.
- [ ] A credible verification approach could distinguish satisfaction from failure.
- [ ] The validation basis supports stakeholder need and intended use.
- [ ] Relationships and change history do not create competing authority.

Record findings with severity, location, evidence, and the decision needed.
Review does not itself accept a candidate or approve a change unless the local
policy grants the reviewer that authority.

## Worked continuation

Use [Northbank's requirement specimens](../authoring/northbank-commitment-requirements.md)
to inspect one obligation's subject, scope, authority, counterexample, and
assessment basis. For `NB-REPLACE-01`, “preserve prior allocation state” does not
mean “the former machine is ready.” A review must preserve that distinction
rather than repair ambiguity by importing an unstated physical guarantee.
