---
name: spot-spew
description: >
  Find avoidable maintenance burden in code, configuration, and delivery
  machinery: implementations of needs that have lapsed, that an available
  capability already covers, that duplicate each other, or that work against
  the grain of adopted software, infrastructure, and tools. Assess each against
  a verified alternative and a named burden. Not for style-only review, defect
  diagnosis, or unscoped cleanup.
---

# Spot Spew

Inspect the requested subject for worthwhile opportunities to remove
unnecessary machinery or simplify necessary machinery. The subject may include
application code, CI and release workflows, build and packaging configuration,
infrastructure definitions, committed generated artifacts, and files kept in
sync by hand that a schema or generator could produce.

An opportunity qualifies only when a concrete maintenance burden is measured
against a verifiable alternative. Tidying, restructuring for taste, and
stylistic conformity are not opportunities.

## Kinds of opportunity

- **Elimination:** the obligation has lapsed, so the machinery can go with
  nothing replacing it. Vestigial features, unreachable branches, scaffolding
  for a fully rolled-out flag, shims for a dropped runtime, version, or
  consumer, and an abstraction with one implementation and no second one
  coming.
- **Capability substitution:** an available capability already covers the need.
- **Idiomatic simplification:** implement required behavior using the adopted
  tool's established abstractions, extension points, and lifecycle. A unique
  domain obligation does not require unconventional framework machinery.
- **Consolidation:** several implementations satisfy one obligation and can
  collapse into one, even when no single one is replaceable by a
  capability or unidiomatic on its own.

## What counts as an available capability

For substitution, treat as available: an adopted dependency, service, platform,
language runtime, or standard library; a configuration surface already in use;
and a documented capability in a newer version of an already-adopted
dependency, whose upgrade cost then belongs in the comparison.

A dependency the project has not adopted is a candidate, never a verified
finding. Name its adoption cost — review, licensing, supply chain, and ongoing
upgrade burden — beside the machinery it would remove.

## For each opportunity

- Establish the required behavior, governing obligations, and constraints. For
  elimination, establish instead that the obligation has lapsed: unreferenced
  machinery is a candidate until dynamic references, configuration, external
  consumers, and published contracts have been checked.
- Identify the custom, redundant, or unconventional implementation and its
  concrete burden, such as duplicated state, extra coordination, fragile
  lifecycle handling, or harder testing and upgrades.
- Verify alternatives against installed versions, official documentation, and
  relevant first-party examples. Local repository conventions alone do not
  establish that an approach is idiomatic. For consolidation, verify that the
  implementations satisfy the same obligation; incidental similarity is not
  duplication.
- Compare retaining the machinery with the alternative: behavior coverage,
  migration effort, remaining complexity, costs, and constraints. Whether the
  need is core to the product belongs in this comparison, not in deciding what
  to examine. Core behavior warrants stronger evidence before replacement, and
  hand-rolled core machinery remains in scope.

Report the strongest opportunities first. For each, cite exact locations and
the capability, idiom, duplication, or lapsed-obligation evidence; explain what
could disappear or become simpler, material tradeoffs, and unresolved
questions.

Non-core, redundant, or unconventional machinery is not inherently waste. Treat
a departure from convention as a signal to investigate, not a finding by
itself. Preserve justified departures when the conventional approach cannot
satisfy the actual obligation or would add burden. Recommend change only when
evidence supports a net reduction in burden; do not recommend changes solely
for stylistic conformity. Distinguish verified findings from candidates; report
when none qualify.

Assessment only: do not modify code or create work items.
