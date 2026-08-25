---
type: Guide
title: Reviewing responsibilities with scenarios
description: How to exercise representative use-case scenarios against architectural elements to find misaligned responsibilities, change spread, coupling, authority violations, and misplaced data variation.
tags: [architecture-documentation, responsibilities, scenarios, crc, coupling, changeability, review]
status: draft
sources:
  - resource: ../foundations/goal-oriented-behavior.md
    title: Goal-oriented behavior and use cases
  - resource: https://www.alistaircockburn.com/Books
    title: Alistair Cockburn — Books
  - id: parnas-decomposition
    resource: https://doi.org/10.1145/361598.361623
    title: D. L. Parnas — On the Criteria To Be Used in Decomposing Systems into Modules
generated: { by: codex/gpt-5.6, at: 2026-08-25T19:19:59Z }
---

# Reviewing responsibilities with scenarios

## Goal

Test whether the names, responsibilities, boundaries, authority, state, and
collaborations of accepted architectural elements remain coherent under
representative behavior and likely change.

A responsibility assigns the durable outcome, policy, decision, state, or
authority an architectural element owns. A material non-responsibility states
what it deliberately leaves to another owner. Neither is itself the normative
statement of what the element shall do or preserve, and neither should become a
list of current functions. Several elements may participate in one behavior,
but each authoritative decision or fact needs one understandable owner.

When a scenario exposes an accepted behavior, invariant, guarantee,
prohibition, boundary rule, or required failure or recovery outcome, treat it
as a candidate Requirement. The architecture review identifies its subject and
response; the Requirement owns the obligation.

## Before you begin

Choose a bounded subject and the canonical C4 elements, bounded contexts, or
other responsibility-bearing elements under review. Select a small set of
use-case scenarios: at least one main success scenario and the extension
scenarios most likely to expose policy, failure, recovery, trust, or authority
boundaries. This is a semantic architecture review, not profile validation.

## Steps

1. For every element, write one concise active responsibility and its material
   non-responsibilities. Name the outcome, policy, state, decision, or authority
   it owns rather than listing its current functions or embedding `shall`
   statements.
2. Walk each scenario from its initiating actor to its outcome. At every step,
   assign the decision, state transition, policy, information need, external
   call, and recovery action to one responsible element.
3. Check **abstraction**: the element's name, responsibility, and level should
   describe one coherent idea. Rename or reconsider an element that alternates
   between business outcome, technical mechanism, and implementation package.
4. Check **responsibility alignment**: compare the responsibility with the
   element's interfaces, state, data, dependencies, and realization evidence.
   Record a mismatch when the element cannot perform its claim or performs
   consequential work no responsibility explains. Identify each copy of
   authoritative state as a cache, replica, projection, snapshot, or
   independent record; two writable sources claiming the same authority imply
   a reconciliation responsibility that must be explicit.
5. Check **evolution** using one or two likely changes. Trace how far each
   change spreads. Reconsider responsibilities that change for unrelated
   reasons or require coordinated edits across several claimed owners.
6. Check **communication and information reachability**. At each material
   boundary, state what may cross, link the Requirements that define accepted
   guarantees, and identify what the receiving boundary validates when an
   external actor enters, authority changes, or a weaker guarantee becomes
   stronger. Look for excessive coordination, knowledge of
   collaborators' internals, or an owner that cannot legitimately reach the
   information needed for its decision. Let dependency direction preserve
   policy ownership and hide volatile knowledge rather than obeying a
   universal layering rule. Treat a cycle as consequential when it reveals
   mutual authority, shared assumptions, or forced coordination, not merely
   because a dependency graph contains one.[^parnas-decomposition]
7. Check **data variation**. Identify where representations, classifications,
   or external forms change meaning. Confirm that translation occurs at the
   boundary owning that semantic change rather than leaking variation through
   the model.
8. Reconcile each finding as an implementation defect, obsolete document,
   insufficient evidence, or unresolved architecture decision. Do not let the
   newest artifact silently win.
9. Update accepted responsibilities, non-responsibilities, relationships, use
   cases, linked Requirements, and selected dynamic views together. Keep
   proposed restructures and candidate Requirements in their proper lifecycle
   until accepted.

## Final check

- Every consequential decision, state transition, policy, and recovery action
  has one understandable owner.
- Material exclusions, authoritative state, and copies are explicit; accepted
  boundary guarantees have one linked Requirement authority.
- Responsibility assignments and Requirement obligations remain distinct.
- Names, responsibilities, interfaces, state, and dependencies agree.
- Likely changes do not spread through accidental knowledge or overlapping
  authority.
- Collaborations are necessary, directional, and explainable.
- Data variation is translated where meaning or authority changes.
- The review did not split elements merely for symmetry or speculative reuse.
- Accepted changes and unresolved decisions remain visibly distinct.

## Related

- [Goal-oriented behavior and use cases](../foundations/goal-oriented-behavior.md)
- [Documenting use cases](documenting-use-cases.md)
- [Documenting C4 views](documenting-c4-views.md)

[^parnas-decomposition]: Parnas compares decomposition by processing step with
    decomposition around information-hiding modules and evaluates their effects
    on change and comprehensibility.
