---
type: Pattern
title: Pattern library
description: Maintain recurring guidance as a problem-indexed, evidence-bearing catalog with consistent anatomy, typed relationships, ownership, and lifecycle.
tags: [docs, pattern-library, catalog, evidence, discovery, lifecycle]
status: stable
sources:
  - id: hillside-patterns
    resource: https://hillside.net/patterns
    title: Hillside Group — Design Patterns Library
  - id: patterns-faq
    resource: https://gee.cs.oswego.edu/dl/pd-FAQ/pd-FAQ.html
    title: Patterns-discussion FAQ
  - id: pattern-writing-language
    resource: https://www.hillside.net/index.php/a-pattern-language-for-pattern-writing
    title: Meszaros and Doble — A Pattern Language for Pattern Writing
  - id: fowler-writing-patterns
    resource: https://martinfowler.com/articles/writingPatterns.html
    title: Martin Fowler — Writing Software Patterns
  - id: azure-cloud-patterns
    resource: https://learn.microsoft.com/en-us/azure/architecture/patterns/
    title: Microsoft Azure Architecture Center — Cloud design patterns
  - id: govuk-pattern
    resource: https://design-system.service.gov.uk/patterns/check-a-service-is-suitable/
    title: GOV.UK Design System — Check a service is suitable
  - id: va-maturity
    resource: https://design.va.gov/about/maturity-scale
    title: VA Design System — Maturity scale
generated: { by: "codex/gpt-5.6", at: 2026-08-15T15:48:17Z }
---

# Pattern library

Maintain recurring guidance as a **problem-indexed, evidence-bearing catalog
with consistent anatomy, typed relationships, ownership, and lifecycle**.

## Context

A community has accumulated recurring solutions across projects, systems, or
teams. The knowledge is too conditional to reduce to universal rules and too
variable to ship as one reusable implementation. Practitioners need to
recognize, compare, adapt, and combine the solutions.

## Problem

How can a community preserve reusable experience without producing an
unsearchable folder of essays, a rigid standards manual, or a catalog of
unsubstantiated preferences?

Isolated pages do not establish shared vocabulary or reveal alternatives.
Uniform templates can improve scanning while encouraging authors to fill
headings without establishing recurrence, evidence, or useful relationships.

## Forces

- **Consistency versus expressive fit** — entries must be comparable without
  forcing every subject into identical prose.
- **Scanability versus depth** — readers need quick selection and enough
  rationale to adapt safely.
- **Evidence versus contribution cost** — trust requires known uses and review,
  while excessive gates prevent useful candidates from emerging.
- **Local autonomy versus shared vocabulary** — realizations vary, but names
  and invariants must remain stable enough for collaboration.
- **Stability versus learning** — adopted patterns need dependable identities,
  yet evidence can narrow, supersede, or invalidate them.
- **Individual usefulness versus composition** — each entry should stand alone
  while relationships help solve larger problems.

## Solution

Create a maintained **pattern library** with:

1. a concise intent thumbnail for every pattern;
2. problem-first discovery by context, problem, force, or goal rather than
   technology alone;
3. a consistent semantic core — name, context, problem, forces, solution,
   consequences, applicability, evidence, and related patterns;
4. flexible optional sections for diagrams, examples, variants, or
   implementation notes;
5. visible maturity that distinguishes candidates, established guidance, and
   deprecated patterns;
6. typed relationships such as _alternative to_, _complements_, _precedes_,
   _follows_, _specializes_, and _conflicts with_;
7. named ownership, contribution, review, and retirement paths; and
8. stable identities and redirects when a pattern is renamed or superseded.

Keep illustrative examples distinct from known uses. Treat the library as a
maintained knowledge product, not a directory convention.

## Consequences

- Practitioners gain shared vocabulary and can compare tradeoffs before
  choosing a solution.
- Evidence and maturity make uncertainty visible instead of hiding it behind
  “best practice.”
- Typed relationships enable composition and reveal gaps or overlaps.
- Consistent anatomy improves browsing but creates ongoing editorial work.
- Ownership, review, and deprecation require durable governance capacity.
- A library without active use and maintenance becomes a graveyard of plausible
  advice.

## When to use

Use this pattern when:

- several reusable solutions recur across independent contexts;
- practitioners need to choose or combine them;
- their applicability and tradeoffs cannot be captured as unconditional rules;
  and
- someone can own evidence, review, and lifecycle.

## When not to use

- There is only one unvalidated idea — publish a candidate note or continue
  observing.
- One reusable implementation already solves the problem without material
  contextual variation.
- The collection is authoritative interface description — use reference
  documentation.
- No community is willing to maintain or use the catalog.

## Evidence and known uses

The Hillside patterns community demonstrates shared vocabulary, known uses,
review, and relationships across pattern collections. Azure makes problem and
tradeoff matching central to selection. GOV.UK surfaces when to use, when not
to use, research, known issues, and contribution. The VA Design System makes
maturity depend on evidence, adoption, stability, and deprecation. Together
these independent libraries support the recurring solution while showing that
no single page template is universal.

## Pattern language threshold

A library becomes a **pattern language** only when relationships and useful
sequences help readers generate coherent larger solutions. A catalog with
cross-links is not automatically a language. Make the stronger claim only when
the collection guides movement from context through related choices and
resulting problems.

## Related patterns

- [Playbook](playbook.md) — organizes selection among established responses.
- [Runbook](runbook.md) — hardens one established operational response.
- [Pattern explainer](../explainers/pattern.md) — defines the pattern form and
  its boundaries.
- [Pattern guide](../guides/pattern.md) — supplies the mining, authoring,
  review, and maintenance process for individual entries.
