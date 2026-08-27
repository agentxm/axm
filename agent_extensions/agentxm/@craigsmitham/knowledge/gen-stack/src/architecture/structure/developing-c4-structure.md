---
type: Guide
title: Developing C4 structure
description: Use when greenfield design or brownfield runtime evidence suggests missing, underdeveloped, misplaced, or disputed software boundaries and responsibilities; develop candidate C4 elements and views without mirroring the implementation inventory.
tags: [architecture-development, c4-model, software-systems, containers, components, views, brownfield, greenfield, evidence]
status: draft
sources:
  - id: shared-candidate-development
    resource: ../developing-candidate-architecture-and-requirements.md
    title: Developing candidate Architecture and Requirements
  - id: c4-model
    resource: c4-model.md
    title: C4 model
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T20:07:37Z
---

# Developing C4 structure

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). It develops candidate C4
> structure; the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) governs only accepted
> concept representation.

Use this guide after the shared [candidate-development
guide](../developing-candidate-architecture-and-requirements.md) identifies a
runtime, responsibility, interface, dependency, or containment concern. For an
already accepted element, use the applicable `Documenting C4 ...` guide.

## Representation

Keep the result in the native candidate or decision surface, not in governed
OKF concepts. Present the material question first, then candidate Software
Systems, Containers, and Components only at needed levels, each with boundary,
responsibilities, interfaces or relationships, containment, evidence and
confidence; follow with useful candidate Views, conflicts, and the decision
needed. Diagrams support these claims but do not own element identity. Do not
invent canonical paths, profile fields, or acceptance status.

## 1. Collect structural evidence

Use the smallest relevant set of:

- deployed applications, processes, data stores, build artifacts, and runtime
  topology;
- interfaces, protocols, messages, schemas, dependencies, and trust crossings;
- code ownership of policies, state, decisions, and external integrations;
- operational ownership, lifecycle, scaling, failure, and recovery behavior;
- accepted responsibilities, ADRs, Requirements, and existing C4 concepts; and
- actor scenarios and Surfaces that the structure realizes.

For greenfield work, start from candidate responsibilities, interactions,
quality concerns, constraints, and deployment assumptions. For brownfield work,
treat repository layout and framework terms as clues, not as C4 identities.

## 2. Develop from the outside inward

Propose only the levels the current decision needs:

1. A candidate **C4 Software System** when a consequential software boundary
   delivers value and has direct interactors and relationships.
2. A candidate **C4 Container** when an application or data-store runtime
   boundary belongs to exactly one Software System.
3. A candidate **C4 Component** when a cohesive, architecturally significant
   responsibility with a defined interface exists inside exactly one Container.
4. A candidate **C4 View** only when a selected projection answers one material
   stakeholder question.

Do not create a component for every package, a container for every deployment
unit label, or a view for every level. Views project candidate or canonical
elements; they do not repair unclear element identity.

## 3. Test responsibility and containment

For each candidate element, state one active responsibility and material
non-responsibilities. Identify the policy, state, decision, authority, or
outcome it owns; its interfaces; consequential dependencies; and exactly one
required parent for Containers or Components.

Reject or revise a candidate when:

- its responsibility is only a list of current functions;
- its name alternates between business meaning, deployment, team, and package;
- two elements claim the same authoritative state or decision without a
  reconciliation responsibility;
- a Container contains another Container or a Component recursively contains a
  Component; or
- the proposed boundary would disappear under a routine refactor while its
  claimed responsibility remains elsewhere.

## 4. Reconcile interaction and obligation views

Relate candidate C4 elements to Capabilities, Features, Surfaces, Bounded
Contexts, and scenarios without making those concepts C4 children. Use
[Developing Surfaces](../surfaces/developing-surfaces.md) when an apparent
structural boundary is actually an actor-facing encounter point.

Use [Developing
Requirements](../requirements/developing-requirements.md) for candidate
obligations. A C4 subject fits when the obligation deliberately constrains that
runtime or responsibility boundary. If the obligation must survive replacement
of the element and continue across all realizations of an interaction, choose a
more load-bearing Surface, Capability, Feature, or System subject instead.

## 5. Review change and failure scenarios

Walk representative success, failure, recovery, scaling, migration, and likely
change scenarios. Check whether decisions and state have one owner, interactions
are directional and meaningful, failure handling is reachable, and likely
change does not spread through accidental knowledge.

Record the candidate, evidence, alternatives, confidence, authority,
recommendation, and blocking status. After acceptance, use [Documenting C4
software systems](documenting-c4-software-systems.md), [containers](documenting-c4-containers.md),
[components](documenting-c4-components.md), or [views](documenting-c4-views.md)
for the canonical update.

## Final check

- Candidate elements express consequential software and responsibility
  boundaries rather than an exhaustive implementation inventory.
- Containment follows Software System → Container → Component exactly.
- Responsibilities, interfaces, state, dependencies, and realization evidence
  agree or their disagreement is visible.
- Views answer named questions without becoming canonical elements.
- Requirement placement survives the relevant replacement counterfactual.
- No candidate element or relationship is presented as accepted Architecture.
