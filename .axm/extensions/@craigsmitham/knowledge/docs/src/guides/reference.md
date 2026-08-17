---
type: Guide
title: Reference guide
description: How to write structured lookup material that stays consistent, scannable, and faithful to the shipped system.
tags: [docs, reference, authoring, how-to, diataxis]
status: stable
sources:
  - id: diataxis-reference
    resource: https://diataxis.fr/reference/
    title: Diátaxis — Reference
generated:
  by: claude/fable-5
  at: 2026-08-08T00:16:56Z
---

# Reference guide

Write material people **look up**, not walk through. For what reference is
and is not, read [Reference explainer](../explainers/reference.md).

## Goal

A reader can find a specific fact or interface detail quickly and trust that
it matches the system as shipped.

## Steps

1. **Define the surface** — which commands, APIs, configs, terms, or errors
   this page (or set) owns; exclude adjacent surfaces.
2. **Pick a repeating shape that mirrors the machinery** — same headings,
   field order, and naming for like entries so comparison is easy, with
   overall structure that follows the product (map ↔ territory).
3. **Describe, do not teach** — state what something is, accepts, returns, or
   means; avoid goal narratives and long motivation.
4. **Prefer completeness for the surface** — cover the set you claimed; mark
   unknowns honestly rather than omitting silently.
5. **Add examples only for clarity** — short illustrations of the thing itself,
   not end-to-end tutorials.
6. **Link out for doing and understanding** — how-tos for tasks, explanations
   for rationale.
7. **Tie to the source of truth** — regenerate from specs when possible, or
   schedule refresh when the system changes; retire stale pages.

## Language that fits

The characteristic language shapes live in the
[Reference explainer](../explainers/reference.md#language-that-fits-reference);
use them as drafting checks rather than restating them here.

## Preconditions

- Access to the real interface (code, OpenAPI, CLI help, schema) you describe
- Agreement on naming consistent with the product

## Pitfalls

The diagnostic taxonomy of failure modes is owned by the
[Reference explainer](../explainers/reference.md#failure-modes-common); review
drafts against it. Two production-time pitfalls to catch while writing:

- **Silent gaps** — claiming a surface but omitting entries or marking
  nothing as unknown, forcing guesswork at lookup time.
- **Describing intent, not the shipped system** — writing from design docs or
  memory without verifying against the current interface.

## Related

- [Reference explainer](../explainers/reference.md)
- [Documentation craft guide](documentation-craft.md)
- [How-to guide](how-to.md)
