# Capability targeting

Capability targeting lets one canonical extension source gain agent-specific
enhancements without making agent identity or the configured target set its
meaning.

## Responsibilities

This document owns:

- the baseline-first progressive-enhancement model;
- capability-based conditions and the narrow agent-specific escape hatch;
- install-time rendering from canonical source; and
- validation and reproducibility boundaries for targeted content.

## Non-responsibilities

It does not define the capability catalog's current fields, a general template
language, per-model targeting, individual writer formats, or the supported
capability inventory. Code, schemas, writer tests, and the catalog own those
details.

## Baseline first

The unconditioned source is the portable baseline and must remain coherent for
an agent with no targeted capabilities. Conditional material enhances that
baseline; it cannot make the target set present at install time part of the
extension's canonical meaning.

Portable conditions name stable capabilities rather than agent IDs. An
agent-specific condition is an explicit long-tail escape hatch and should be
diagnosed when an equivalent capability condition exists. Per-model targeting
is excluded because model selection may occur at runtime and differ within one
agent.

## Rendering and authority

Canonical source remains the authority. AXM renders a projection for each
configured agent at install and reconciliation time because the workspace knows
the target, layout, writer, and pinned capability input. Rendered projections
are disposable and may be reformatted by workspace tools; byte identity is not
their ownership test.

Rendering is deterministic for the same canonical source, targeting rules,
writer version, and pinned capability facts. A capability-catalog update does
not silently change a locked installation unless the operation explicitly
admits that new rendering input.

The conditional syntax remains deliberately constrained and model-legible. It
supports bounded conditions and substitutions, not arbitrary expressions,
loops, or includes.

## Validation

AXM treats untrusted third-party conditional syntax conservatively: invalid
enhancements do not justify corrupting the portable source or unrelated
content. Publishing an AXM-authored targeted extension applies the stronger
structural and zero-capability coherence gate.

## Testing strategy

Golden writer tests prove deterministic baseline and enhanced projections
across capability grades and unsupported targets. Property and adversarial
tests cover malformed directives, unknown capabilities, raw-source
legibility, formatter changes, and the invariant that the empty-capability
render remains complete.
---

status: stable
description: How AXM selects, validates, and renders extension content for agent capabilities.
---
