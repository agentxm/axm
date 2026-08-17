---
type: Guide
title: Applying Just Enough Architecture Docs
description: How to adopt the pattern, select architecture-document subjects and views, write durable concerns, connect executable evidence, and migrate an existing corpus.
tags: [architecture-documentation, authoring, architecture-corpus, functional-semantics, quality-concerns, migration]
status: draft
sources:
  - id: just-enough-pattern
    resource: just-enough-architecture-docs.md
    title: Just Enough Architecture Docs
generated:
  by: codex/gpt-5.6
  at: 2026-08-16T02:29:42Z
---

# Applying Just Enough Architecture Docs

Use this guide to establish or revise a repository architecture corpus using
the [Just Enough Architecture Docs](just-enough-architecture-docs.md) pattern.
The goal is a small body of accepted, durable functional, quality, and
structural context—not a prose mirror of the implementation.

## Before you begin

Identify:

- the system or authority boundary the corpus describes;
- the current architecture, product, requirements, guide, and decision docs;
- executable and live sources that already own precise facts; and
- the people or process authorized to accept desired-state claims.

If the work is still evaluating alternatives, keep it in a proposal or design
record. Promote only accepted outcomes into the architecture corpus.

## 1. Declare the local adoption profile

Keep portable authoring guidance outside the repository when it is available as
a shared package. In the repository, state only the local choices needed to
apply it:

```markdown
This repository adopts Just Enough Architecture Docs.

- Corpus: `docs/architecture/`
- System boundary: the deployable product and its owned data and integrations
- Local authority or deviations: generated interface definitions remain
  authoritative for exact transport contracts
```

Also add a short discovery route from the repository's persistent contributor
or agent instructions to this guide. Do not copy the pattern, procedure, or
generic templates into a local authoring manual.

## 2. Inventory claims by authority, not merely by file

Review existing material and classify its substantive claims:

| Claim kind | Likely authority |
| --- | --- |
| Purpose, accepted business distinctions, rationale | Durable prose |
| Responsibilities, boundaries, authority, invariants | Architecture prose |
| Exact accepted examples and regressions | Tests or executable examples |
| Exact contracts and shapes | Types, schemas, or interface definitions |
| Current wiring and implementation | Code and configuration |
| Current operation | Runtime and observability systems |
| Proposed choices and delivery state | Proposals and work tracking |

The file containing a claim today may not be its proper long-term authority.
Move durable meaning into the corpus, replace copied mechanics with links, and
leave proposals in their own lifecycle.

## 3. Select a cohesive subject

Choose the unit readers need to understand and change together. It might be:

- a foundation or shared policy;
- a product surface or feature;
- a capability spanning several surfaces;
- a subsystem or bounded authority; or
- a cross-cutting concern.

Test the choice by asking whether one responsibility and review conversation can
reasonably own the document. Split unrelated concerns. Combine fragments that
repeat the same accepted meaning. Do not build both a feature tree and a
capability tree unless each resolves a distinct, consequential question.

## 4. Apply the admission test claim by claim

For each possible inclusion, ask:

1. Is it accepted desired state?
2. Does it matter to functional meaning, a consequential quality, or
   architecture?
3. Will it remain useful through normal implementation change?
4. Is it difficult or unreliable to infer from executable and live sources?
5. Is it worth maintaining and reconciling?

Omit claims that do not pass. A short document with one important rule is
preferable to a complete-looking catalog that obscures authority.

## 5. Establish responsibility and scope

Begin the document with enough orientation to answer:

- What outcome or policy does this subject own?
- What does it deliberately not own?
- Which stakeholders and adjacent owners matter?
- Which system, product, data, or lifecycle boundary is in scope?

Use stable domain and architectural names rather than current filenames,
classes, endpoints, or vendors. Link to the owning concept when a term is
defined elsewhere.

## 6. Choose only the necessary concern views

Select views after selecting the subject:

| View | Include when readers need to preserve… |
| --- | --- |
| Functional | Outcomes, business distinctions, rules, transitions, permissions, failure semantics, or cross-surface behavior that code cannot explain reliably |
| Quality | A contextual quality concern, scenario, threshold, risk, or tradeoff that constrains the design |
| Architecture | Responsibilities, authority, state, boundaries, dependencies, interactions, invariants, or structural consequences |
| Evidence | A route to executable or live sources that establish detail, conformance, or current state |

A compact document may integrate all useful views in a few paragraphs. A richer
subject may use explicit headings. A cross-cutting quality or trust view may be
its own document and be linked from several subjects. Omit an empty view.

## 7. Write the functional meaning

Capture the parts of behavior that implementation inspection is likely to
misread or miss:

- the user or business outcome and why it matters;
- distinctions among similar states or operations;
- permissions and decision rights;
- consequential transitions and failure semantics;
- rules that coordinate several product surfaces; and
- intentional exclusions or non-goals that define the behavior's boundary.

Prefer declarative statements over step-by-step implementation narratives. If
tests already own the exact scenario matrix, state the durable rule and link to
the tests instead of copying every case.

## 8. Make quality concerns contextual

Use [Quality characteristics and architectural
concerns](quality-characteristics-and-architectural-concerns.md) to distinguish
a broad characteristic from a local requirement. Name the stakeholder, risk,
scope, conditions, required response, and assessment method as needed.

Refine an architecture-driving concern into a scenario when a label such as
*reliable*, *usable*, or *maintainable* permits incompatible designs. Record an
accepted threshold when one exists. When it does not, state the known
constraint, tradeoff, and evidence needed to settle it rather than inventing a
target.

## 9. Explain the architectural response

Connect the functional and quality concerns to durable structural choices:

- who owns the relevant policy and state;
- what crosses each boundary and what must not;
- which dependency direction protects the responsibility;
- which invariant or consistency model must be preserved;
- how failure, recovery, trust, deployment, or observation affects the design;
  and
- which tradeoff was accepted.

Do not merely name components. Explain why the chosen division is necessary and
what future changes must continue to respect.

## 10. Link evidence without duplicating it

For each important claim, identify the best current evidence or enforcement:

- tests and executable examples for supported scenarios;
- schemas and interface definitions for exact contracts;
- static checks and constraints for decidable invariants;
- code and configuration for current implementation;
- telemetry, objectives, and exercises for observed qualities; and
- decisions or external standards for imposed authority.

Link to a stable discovery point rather than a fragile line number when
possible. Say what the evidence contributes. Do not imply that a test,
benchmark, or dashboard proves more than it observes.

## 11. Migrate an existing corpus

Move incrementally by subject:

1. Select one architecture document or missing high-value subject.
2. Retain claims that pass the admission test.
3. Relocate proposals, procedures, historical narrative, and reference detail
   to their proper authorities.
4. Replace copied code, contracts, configuration, and test cases with links.
5. Add missing functional or quality context that explains the structure.
6. Merge overlapping documents or split unrelated authorities.
7. Delete the superseded local authoring guide after the shared route works.

Do not rewrite every document into one template. Preserve useful local shape
while making authority and concern views clear.

## 12. Review and maintain

Review a document when its accepted behavior, stakeholder concern, quality
constraint, responsibility, boundary, or evidence route changes. During review:

- reapply the admission test;
- confirm desired state has not been replaced by current-state narration;
- reconcile disagreement with executable and live evidence;
- remove facts that another source now owns better;
- check that functional, quality, and architecture claims remain distinct; and
- keep navigation accurate.

Treat a document that no longer repays its maintenance cost as a candidate for
merging or deletion, not as a permanent historical artifact.

## A small illustrative shape

The following is a prompt, not a required template:

```markdown
# Reservation

## Responsibility
Owns the promise that accepted capacity is held for one requester until the
reservation is confirmed, expires, or is released. It does not own payment.

## Functional concern
Confirmation succeeds only for an active reservation; expiration and release
are distinct business outcomes even if both make capacity available again.

## Quality concern
After a process stops during confirmation, recovery must not produce both a
confirmed reservation and restored capacity. Link to the accepted recovery
scenario and evidence.

## Architecture
The reservation authority serializes capacity transitions. Payment observes a
reservation result but cannot mutate capacity directly.

## Evidence
Links to the state-machine tests, storage constraint, and recovery exercise.
```

This shape works because the subject is cohesive and every included view adds
meaning. Another subject may need only a responsibility and one invariant; a
system-wide trust concern may need several linked views.

## Final check

Before accepting an architecture document, verify that:

- every durable claim passes the admission test;
- the subject is coherent and is not forced into a feature or capability
  taxonomy;
- functional, quality, architecture, and evidence views are distinguishable;
- broad quality labels have contextual meaning;
- prose explains accepted meaning rather than duplicating executable detail;
- links point to the authority that owns exact or current facts;
- proposals and current-state observations are labeled and housed separately;
  and
- the repository contains only a local adoption profile, not a fork of this
  portable guidance.
