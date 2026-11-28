---
type: Checklist
title: Reviewing requirement sets
description: Reviews a bounded requirement set for consistency, coverage, balance, traceability, and changeability without claiming universal completeness. Use when a baseline, release scope, or feature's requirements are assessed together rather than one at a time.
tags: [review, requirement-set, consistency, coverage, traceability, completeness, requirements-engineering]
generated: { by: codex/gpt-6, at: 2026-11-11T20:13:01Z }
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

The [set characteristics under 29148](../foundations/iso-iec-ieee-29148-requirement-quality.md#characteristics-of-a-set-of-requirements)
own the standard's completeness, consistency, feasibility, comprehensibility,
and validation-feasibility definitions. Include these in the bounded assessment;
this checklist adds authority, traceability, and changeability concerns without
redefining those characteristics. Record findings with severity, location,
evidence, and the decision needed, as for an individual review.

## Worked continuation