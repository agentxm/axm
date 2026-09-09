---
type: Checklist
title: Reviewing requirement sets
description: Reviews a bounded requirement set for consistency, coverage, balance, traceability, and changeability without claiming universal completeness. Use when a baseline, release scope, or feature's requirements are assessed together rather than one at a time.
tags: [review, requirement-set, consistency, coverage, traceability, completeness, pe-solution]
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Reviewing requirement sets

Declare the reviewed boundary, baseline or revision, applicable source set, and
known exclusions before making a set-level claim.

- [ ] Every in-scope requirement has stable identity, authority, and maturity.
- [ ] Terms, subjects, units, assumptions, and normative language are consistent.
- [ ] Requirements do not conflict or prescribe incompatible outcomes.
- [ ] Relevant goals, stakeholder groups, operating contexts, lifecycle events,
      interfaces, data, qualities, hazards, constraints, and external obligations
      were considered for the declared boundary.
- [ ] Parent needs and requirement refinements have explainable coverage.
- [ ] Quality tradeoffs and cross-cutting concerns are visible.
- [ ] Each normative requirement has a plausible realization and assessment path.
- [ ] Orphans, duplicates, gaps, unverifiable claims, and stale witnesses are recorded.
- [ ] Changes can be localized without silently redefining unrelated requirements.

“Complete” is always relative to declared sources, scope, assumptions, method,
and review date. Report unknown or unavailable evidence instead of turning it
into a pass.

## Worked continuation

The [Northbank specimen set](../authoring/northbank-commitment-requirements.md)
connects allocation, substitution, atomicity, replay, and migration. Review
whether their scopes agree and whether all writers can preserve the chosen
invariant. The unresolved partner branch is not a completed requirement set;
record its hold/expiry and unknown-outcome questions instead of inferring
completeness from the existing local-store evidence.
