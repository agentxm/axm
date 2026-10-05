---
type: Decision
status: stable
description: Managing or publishing a skill does not impose universal portability or change its native behavior.
---

# Skill compatibility is independent of authorship

## Context

Skill authors distribute portable instructions alongside native invocation
controls, tool configuration, hooks, and supporting files. A field allowlist
that differs between acquired and authored content creates a discontinuity:
adopting unchanged content can make a previously manageable skill invalid.
Removing fields to satisfy that gate can remove behavior the author intended.

The earlier Skills architecture treated a usable portable baseline as universal.
That model remains useful for deliberate progressive enhancement, but it cannot
represent all existing skills faithfully. AXM's ownership and distribution
benefits should not depend on an author redesigning a skill for every host.

## Decision

Treat compatibility, authorship, and distribution eligibility as separate
questions. Adopt the [Skills design principles](../extensions/skills.md) as the
canonical explanation of preservation, operation-specific validation,
diagnostics, and publication. Limit the universal baseline requirement to
content choosing AXM's portable enhancement contract.

## Consequences

Existing native skills are legitimate managed and publishable content when
they meet the applicable operation's requirements. This does not certify
unsupported hosts or waive package safety, ownership, publication authority,
or current external protocol obligations.

The stricter authored validator must be reconciled with this design through
its owning executable specifications and implementation. This record accepts
the direction; it does not claim that reconciliation has shipped or select a
new native-field schema, translation system, or essentiality declaration.

## Alternatives

A universal strict standard gate would make adoption depend on removing valid
host behavior. Maintaining permanent acquired/authored exceptions would keep
compatibility dependent on ownership. Automatic normalization could silently
change native semantics. None provides the lifecycle continuity AXM needs.

## Reconsideration

Revisit individual admission constraints when concrete host failures,
distribution requirements, or stronger explicitly selected portability claims
justify them. Each constraint needs evidence at the boundary it protects;
unknown metadata alone is not that evidence.
