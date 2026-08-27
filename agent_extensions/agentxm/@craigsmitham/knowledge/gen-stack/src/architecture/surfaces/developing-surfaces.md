---
type: Guide
title: Developing Surfaces
description: Use when greenfield intent or brownfield interaction evidence suggests a missing, underdeveloped, misplaced, or disputed actor-facing boundary; develop the smallest candidate Surface set without treating routes or current UI structure as accepted Architecture.
tags: [architecture-development, surfaces, interactions, brownfield, greenfield, evidence, candidate-architecture]
status: draft
sources:
  - id: shared-candidate-development
    resource: ../developing-candidate-architecture-and-requirements.md
    title: Developing candidate Architecture and Requirements
  - id: capability-explanation
    resource: ../capabilities/capabilities.md
    title: Capabilities in software architecture
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T20:07:37Z
---

# Developing Surfaces

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). It develops candidate
> Surfaces; the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) governs only an accepted
> concept's representation.

Use this guide after the shared [candidate-development
guide](../developing-candidate-architecture-and-requirements.md) identifies an
actor-facing interaction concern. For already accepted meaning, go directly to
[Documenting surfaces](documenting-surfaces.md).

## Representation

Keep the result in the native candidate or decision surface, not in a governed
OKF concept. For each candidate Surface, present actors and encounter boundary,
recognizable behavior, exclusions, possible narrower Surfaces, candidate
Feature and C4 relationships, evidence and confidence, then the decision and
authority needed. Use diagrams or route inventories only as evidence or views.
Do not invent canonical paths, relationship frontmatter, or acceptance status.

## 1. Collect interaction evidence

Inventory only the evidence needed for the current question:

- actors, goals, main and material alternative or failure scenarios;
- user-visible applications, pages, workflows, CLI commands and subcommands,
  APIs, protocols, devices, consoles, and notifications;
- stable public or internal contracts, accessibility and trust boundaries;
- tests, telemetry, support reports, incidents, and repeated workarounds; and
- current routes or handlers as implementation evidence.

For greenfield work, use Intent, proposed scenarios, constraints, risks, and
prototypes. For brownfield work, distinguish a recognizable encounter point
from the files, frameworks, or services that currently render it.

## 2. Propose encounter boundaries

For each candidate Surface, state:

- the actors who encounter it;
- the interaction boundary and recognizable behavior available there;
- material exclusions from adjacent Surfaces;
- narrower encounter points with independent durable identity; and
- candidate relationships to Features and realizing C4 elements.

Create a narrower Surface only when actors or maintainers recognize it as a
stable interaction boundary. A route, screen component, endpoint, command
handler, or test case does not earn Surface identity by existing.

## 3. Test independence from realization

Ask whether the encounter point would still matter if its current web app,
service, component, or protocol implementation changed. If yes, preserve the
Surface independently and relate it many-to-many to C4 realization. If the
candidate merely names one runtime boundary with no actor-facing identity,
route it to [Developing C4 structure](../structure/developing-c4-structure.md).

Do not turn a Feature into a Surface: the Feature owns recognizable behavior,
while the Surface is where actors encounter it. Do not turn a Use Case into a
Surface: the Use Case owns the actor goal and scenario.

## 4. Test Requirement placement

When evidence contains a guarantee, invariant, failure outcome, accessibility
condition, response bound, or interaction rule, route it to [Developing
Requirements](../requirements/developing-requirements.md). Prefer the Surface
as candidate subject when the obligation must hold across every legitimate
realization of that encounter point. Prefer a structural subject only when the
obligation intentionally binds that runtime or responsibility boundary.

This counterfactual prevents an actor-facing obligation from being stranded on
the Component where one failure happened.

## 5. Review and hand off

Walk representative scenarios through the candidate hierarchy. Check that each
actor can find the encounter point, that narrower Surfaces do not mirror a UI
component tree, and that material behavior is neither omitted nor duplicated.
Record evidence, alternatives, confidence, decision authority, recommendation,
and blocking status using the shared guide.

After the applicable authority accepts the Surface identity, boundary, and
material relationships, use [Documenting surfaces](documenting-surfaces.md) to
record only the accepted concepts and earned navigation.

## Final check

- The candidate is recognizable to actors and maintainers independently of its
  current implementation.
- Surface hierarchy models interaction, not C4 or source-code containment.
- Features, Use Cases, and C4 elements retain their separate meanings.
- Candidate Requirements are routed to the load-bearing subject.
- Missing or disputed interaction meaning is explicit and no candidate is
  represented as accepted.
