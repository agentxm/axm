---
type: Architecture
status: stable
description: How portable extension content gains bounded agent-specific enhancements.
depends-on:
  - ./overview.md
  - ../workspace/agents.md
---

# Agent-specific extension content

Portable extension content may gain agent-specific enhancements without making
agent identity or the configured target set part of its canonical meaning.

This document governs conditional enhancement for extension types with an
AXM-owned renderer. It excludes Skills: [Skills](skills.md) are placed unchanged
and have no per-agent rendering, including for apparently conditional text.

## Responsibilities

This document owns:

- the baseline-first progressive-enhancement model;
- capability-based conditions and the narrow agent-specific escape hatch;
- install-time rendering from canonical extension content; and
- validation and reproducibility boundaries for targeted content.

## Non-responsibilities

It does not define the capability catalog's current fields, a general template
language, per-model targeting, individual writer formats, or the supported
capability inventory. Code, schemas, writer tests, and the catalog own those
details.

## Baseline first

The unconditioned extension content is the portable baseline and must remain
coherent for an agent with no targeted capabilities. Conditional material
enhances that baseline; it cannot make the target set present at install time
part of the extension's canonical meaning.

Portable conditions name stable capabilities rather than agent IDs. An
agent-specific condition is an explicit long-tail escape hatch and should be
diagnosed when an equivalent capability condition exists. Per-model targeting
is excluded because model selection may occur at runtime and differ within one
agent.

## Durable targeting choices

Any command option that claims persistent placement must be represented in
authoritative workspace configuration and consumed by later reconciliation.
An option that affects only the first materialization while `sync` derives a
different target set is not a supported durable choice.

The configured agent set is workspace intent. Agent IDs and the target set are
never written into portable extension manifests. If settings cannot represent
a proposed per-extension target, authoring and lifecycle commands must not
offer that target as persistent behavior.

## Rendering and authority

Canonical extension content remains authoritative. For extension types that own a renderer, AXM renders a projection
for each configured agent at install and reconciliation time because the
workspace knows the target, layout, writer, and accepted capability input.
Rendered projections are disposable and may be reformatted by workspace tools;
byte identity is not their ownership test. Disposable describes their role
relative to canonical content. Effective MCP declarations authorize complete
named-entry replacement; Hook declarations select parsed command registrations
below their canonical script roots. Other artifact types retain their scoped
ownership requirements. [Managed-file ownership](../workspace/managed-file-ownership.md)
defines these mutation boundaries.

Rendering is deterministic for the same canonical extension content, targeting
rules, writer version, and accepted capability facts. A capability-catalog
update does not silently change installed output unless the operation
explicitly admits that new rendering input.

The conditional syntax remains deliberately constrained and model-legible. It
supports bounded conditions and substitutions, not arbitrary expressions,
loops, or includes.

## Validation

AXM treats untrusted third-party conditional syntax conservatively: invalid
enhancements do not justify corrupting the portable extension content or
unrelated content. Publishing content that uses this portable enhancement contract applies its
structural and zero-capability coherence gate. Skill authorship never selects this rendering contract. Skill fields and
instructions remain opaque content passed through unchanged.

## Testing strategy

Golden writer tests prove deterministic baseline and enhanced projections
across capability grades and unsupported targets. Property and adversarial
tests cover malformed directives, unknown capabilities, unrendered-content
legibility, formatter changes, and the invariant that the empty-capability
render remains complete.
