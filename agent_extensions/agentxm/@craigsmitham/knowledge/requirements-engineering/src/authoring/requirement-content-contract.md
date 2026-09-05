---
type: Reference
title: Requirement content contract
description: Defines the minimum semantic content needed for a durable, reviewable, assessable requirement.
tags: [requirement, content-contract, identity, evidence, traceability]
generated: { by: codex/gpt-5.6, at: 2026-08-29T20:06:39Z }
---

# Requirement content contract

A durable requirement should preserve these semantics, whether they appear as
native fields, prose, a model, or linked records:

| Content | Purpose |
| --- | --- |
| Stable identity and title | Supports reference, change, and lineage |
| Maturity and authority | Distinguishes candidate from normative obligation |
| Obligated subject | Identifies what must comply |
| Conditions and trigger | Bounds when the obligation applies |
| Required or prohibited outcome | States the obligation itself |
| Scope, exceptions, and terms | Prevents hidden interpretations |
| Source and rationale | Preserves provenance and intent |
| Classification | Supports discovery and fit-for-purpose review |
| Relationships | Links parents, refinements, conflicts, realization, and evidence |
| Verification approach | Identifies a credible way to assess satisfaction |
| Validation basis | Identifies why the obligation serves intended need |
| Open questions and assumptions | Makes uncertainty visible |
| Change history or decision evidence | Preserves authority over time |

Not every item must be a heading. Prefer native structured fields when they
carry the semantics exactly. Omit inapplicable content deliberately; do not
silently omit information that remains unknown.
