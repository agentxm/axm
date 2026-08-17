---
type: Pattern
title: Just Enough Architecture Docs
description: A candidate pattern for preserving accepted, durable functional, quality, and structural meaning that executable sources cannot reveal reliably, without maintaining a parallel specification corpus.
tags: [architecture-documentation, architecture-corpus, functional-semantics, quality-concerns, executable-specification, documentation-pattern]
status: draft
sources:
  - id: fairbanks-risk-driven
    resource: https://www.georgefairbanks.com/software-architecture/documentation/
    title: George Fairbanks — Risk-driven architecture documentation
  - id: iso-42010
    resource: https://www.iso.org/standard/74393.html
    title: ISO/IEC/IEEE 42010:2022 — Architecture description
generated:
  by: codex/gpt-5.6
  at: 2026-08-16T02:29:42Z
---

# Just Enough Architecture Docs

**Intent:** Preserve the accepted, durable meaning needed to change a system
safely, while deferring precise and current facts to the executable sources
that already own them.

**Maturity:** Candidate. Established architecture practices support its parts,
but this exact synthesis needs evidence from independent use before it should
be treated as a proven pattern.

## Context

Use this pattern for a code-first system whose maintainers want a small
architecture corpus without making prose the source of truth for detailed
functional specifications.

Code, tests, types, schemas, configuration, and runtime evidence already reveal
much of the system. They are often the most precise and current authority for
what the implementation accepts and does. Yet some accepted meaning remains
hard to infer: why a behavior matters, which business distinctions are
intentional, what quality risk drives a boundary, or which responsibility and
invariant must survive a rewrite.

## Problem

Structure-only architecture documentation can explain components while leaving
out the functional and quality context that makes those components
intelligible. A comprehensive prose specification can restore that context but
creates a parallel account of behavior that is costly to maintain and prone to
drift.

How can a team retain consequential functional, quality, and architectural
meaning without documenting everything the repository already says better?

## Forces

- **Meaning versus precision:** prose can explain intent and rationale; an
  executable source usually owns exact mechanics more reliably.
- **Cohesion versus disambiguation:** related concerns need to be understood
  together without collapsing functional, quality, and structural claims into
  one undifferentiated narrative.
- **Usefulness versus maintenance:** every durable document must repay review,
  discovery, and reconciliation costs.
- **Desired state versus observed state:** accepted obligations must remain
  distinguishable from current implementation and operational evidence.
- **Stable subjects versus arbitrary symmetry:** different systems need
  documents around different product surfaces, features, capabilities,
  subsystems, or cross-cutting concerns.

## Solution

Maintain one cohesive architecture corpus for each system or bounded authority.
Admit only accepted, durable meaning that is consequential to the product or
architecture and difficult to recover reliably from executable or live sources.

### Apply the admission test

Keep a claim in the corpus when all of these are true:

1. It expresses accepted desired state, not an unaccepted proposal.
2. It matters to functional meaning, a consequential quality, or architecture.
3. It is likely to remain useful through ordinary implementation change.
4. Code, tests, schemas, configuration, and runtime evidence do not reveal it
   reliably enough on their own.
5. Its value justifies ongoing discovery, review, and reconciliation.

If a claim fails the test, leave it with the source that naturally owns it.
Temporary design options belong in proposals or work records; exact mechanics
belong in executable artifacts; observed operation belongs in live evidence.

### Assign authority by information kind

Use prose for durable meaning: purpose, stakeholder concerns, business
distinctions, responsibilities, non-responsibilities, rationale, invariants,
quality constraints, and accepted architectural consequences.

Let the other authorities retain their strengths:

| Authority | What it should own |
| --- | --- |
| Tests and executable examples | Exact supported scenarios and regression evidence |
| Types, schemas, and interface definitions | Exact machine-consumed contracts |
| Code and configuration | Current implementation and wiring |
| Runtime and observability systems | Current deployed and observed state |
| Work tracking and proposals | Delivery state and unaccepted future choices |

Link to those sources when they support a durable claim. Do not transcribe them
into prose merely to make a document look complete.

### Choose a subject before choosing views

Organize each document around one cohesive subject that readers need to reason
about. Common subjects include:

- a system foundation or shared policy;
- a product surface or feature;
- a business or technical capability;
- a subsystem or bounded authority; or
- a system-wide concern such as identity, recovery, or trust.

These are alternatives, not a required hierarchy. A capability view may expose
end-to-end outcomes while a product-surface view exposes user-visible rules.
Use whichever subject produces the most coherent ownership and change context.
Do not create matching documents for every feature or capability when only some
contain durable, non-inferable concerns.

### Keep concern views distinct but connected

Within a subject, include only the views that carry material information:

- **Functional:** outcomes, business distinctions, rules, state transitions,
  permissions, failure semantics, and cross-surface interactions that code
  cannot explain reliably by itself.
- **Quality:** contextual and assessable concerns, scenarios, thresholds,
  tradeoffs, and risks that constrain the solution.
- **Architecture:** responsibilities, non-responsibilities, authority,
  boundaries, dependencies, invariants, and the structural response to the
  functional and quality concerns.
- **Evidence:** links to tests, contracts, schemas, checks, telemetry, or code
  that provide current detail or conformance evidence.

These views can be sections in one document, separate documents, or links to an
owning cross-cutting view. Co-locate them when they change and are reviewed
together; separate them when they have different owners or lifecycles. Never
add an empty heading simply to satisfy a template.

ISO/IEC/IEEE 42010 organizes architecture descriptions around stakeholders,
concerns, viewpoints, and views without prescribing one document format.[^iso-42010]
The concern views here serve the same selection purpose while making functional
and quality context explicit.

### Reconcile disagreement explicitly

Architecture prose is accepted desired state. Executable and live sources show
supported, implemented, or observed state within their scopes. When they
disagree, determine whether the implementation is wrong, the document is
obsolete, the evidence is insufficient, or the accepted intent has changed.
Update the appropriate authority; do not silently declare whichever artifact is
newest to be correct.

## Consequences

The corpus becomes small enough to review and portable enough to survive
refactoring. Readers can understand not only how the system is divided, but
which functional and quality concerns justify the division. The approach avoids
exhaustive requirements duplication and traceability machinery.

The selectivity requires judgment. Some important context will be omitted until
its absence causes friction. Documents can still drift, and teams must resolve
disagreement rather than relying on a universal precedence rule. The pattern
also provides less standalone detail than a regulated or contractually required
specification set; use those required artifacts when the context demands them.

## Use when

- executable sources already provide strong behavioral and contract evidence;
- maintainers need durable context that is expensive to rediscover;
- the system has consequential functional or quality constraints on its
  structure; and
- a comprehensive prose specification would create more maintenance than
  confidence.

## Do not use as a substitute for

- externally mandated requirements, assurance, or traceability records;
- a temporary design proposal or architecture decision under evaluation;
- API, schema, or configuration reference generated from its owning source;
- operational runbooks and live service-state evidence; or
- tests needed to establish exact supported behavior.

## Failure modes

- **Too little context:** “the code is the documentation” becomes an excuse to
  omit non-inferable business meaning and tradeoffs.
- **Catalog thinking:** the corpus mirrors every feature, capability, component,
  or quality characteristic regardless of architectural significance.
- **Generic quality labels:** words such as *secure* or *scalable* appear
  without stakeholders, conditions, responses, measures, or consequences.
- **Forced symmetry:** every subject gets identical headings and empty views.
- **Split-view drift:** functional, quality, and architecture documents describe
  the same claim independently instead of linking to one owner.
- **Prose as executable truth:** examples or copied contracts become a second
  implementation specification.
- **Silent reconciliation:** current code or newer prose is assumed to win
  without checking the accepted intent and the scope of evidence.

## Evidence and provenance

George Fairbanks describes a risk-driven approach in which architecture effort
is proportionate to risk and small projects may need only minimal
documentation.[^fairbanks-risk-driven] ISO/IEC/IEEE 42010 supplies the
stakeholder, concern, viewpoint, and view model used to select relevant
architectural communication.[^iso-42010] These precedents support the pattern's
selective and concern-oriented foundations. The combined admission test,
subject/view separation, and explicit functional–quality–architecture form are
presented here as a candidate pending independent known uses.

## Related guidance

- [Software architecture overview](overview.md)
- [Responsibilities and non-responsibilities](responsibilities-and-non-responsibilities.md)
- [Invariants, preservation, and enforcement](invariants-and-enforcement.md)
- [Views and concerns](views-and-concerns.md)
- [Quality characteristics and architectural concerns](quality-characteristics-and-architectural-concerns.md)
- [Applying Just Enough Architecture Docs](applying-just-enough-architecture-docs.md)

[^fairbanks-risk-driven]: Fairbanks advocates matching architecture effort to
    risk rather than applying the same documentation burden to every project.
[^iso-42010]: ISO/IEC/IEEE 42010 defines requirements for architecture
    descriptions and relates stakeholder concerns to viewpoints and views.
