---
type: Guide
title: Developing Surfaces
description: Use when greenfield intent or brownfield interaction evidence suggests a missing, underdeveloped, misplaced, or disputed actor-facing boundary; develop the smallest candidate Surface set without treating routes or current UI structure as accepted Architecture.
tags: [architecture-development, surfaces, interactions, interface-identity, brownfield, greenfield, evidence, candidate-architecture]
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
  at: 2026-08-27T14:31:33Z
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
- public interaction addresses, aliases, modes, and navigation-only groupings;
- stable public or internal contracts, accessibility and trust boundaries;
- tests, telemetry, support reports, incidents, and repeated workarounds; and
- current routes or handlers as implementation evidence.

For greenfield work, use Intent, proposed scenarios, constraints, risks, and
prototypes. For brownfield work, distinguish a recognizable encounter point
from the files, frameworks, or services that currently render it.

## 2. Establish the interface identity policy

Before judging individual encounter points, determine whether accepted System
Architecture already defines Surface identity at an interface-native unit. Use
the public interaction contract and current interface inventory as evidence,
not as substitutes for that accepted meaning. A System may, for example,
decide that every public CLI command path has its own Surface, that one browser
workflow spans several routes, or that one protocol operation is part of a
broader encounter. That policy is system-specific Architecture, not a
universal inference from the interface technology.

Classify the material interface evidence before proposing the hierarchy:

| Evidence | Candidate reading |
| --- | --- |
| Public CLI command or subcommand path | An independently addressable encounter and strong Surface candidate when the System's identity policy selects command paths. |
| Command namespace or navigation node | A candidate parent Surface when actors can address and recognize it; a source-code grouping alone is not enough. |
| Alias or alternate spelling | Evidence for the same encounter unless the applicable authority has accepted a distinct identity. |
| Flag, output form, preview, or execution mode | Behavior of the owning encounter unless actors recognize a separately durable interaction boundary. |
| Browser route, API operation, or protocol method | Interaction evidence whose Surface granularity depends on the accepted identity policy and actor workflow. |
| Screen component, command handler, request handler, or test node | Realization evidence only; it does not establish an actor-facing identity. |

Distinguish a public command path from the handler that currently realizes it:
one path may use several handlers, and several aliases may resolve to one path.
Build interaction hierarchy from the actor-visible contract, not from the
framework or source tree.

When no applicable identity policy exists and the choice would materially
change Surface identity, hierarchy, Requirement placement, or maintenance,
develop that policy as candidate Architecture alongside the affected Surface
set. Name the alternatives and ask the applicable authority to decide rather
than applying an unstated convention.

## 3. Propose encounter boundaries

For each candidate Surface, state:

- the actors who encounter it;
- the interaction boundary and recognizable behavior available there;
- material exclusions from adjacent Surfaces;
- narrower encounter points with independent durable identity; and
- candidate relationships to Features and realizing C4 elements.

Create a narrower Surface only when actors or maintainers recognize it as a
stable interaction boundary under the applicable interface identity policy. A
route, screen component, endpoint, command handler, or test case does not earn
Surface identity merely by existing.

## 4. Test independence from realization

Ask whether the encounter point would still matter if its current web app,
service, component, or protocol implementation changed. If yes, preserve the
Surface independently and relate it many-to-many to C4 realization. If the
candidate merely names one runtime boundary with no actor-facing identity,
route it to [Developing C4 structure](../structure/developing-c4-structure.md).

Do not turn a Feature into a Surface: the Feature owns recognizable behavior,
while the Surface is where actors encounter it. Do not turn a Use Case into a
Surface: the Use Case owns the actor goal and scenario.

## 5. Test Requirement placement

When evidence contains a guarantee, invariant, failure outcome, accessibility
condition, response bound, or interaction rule, route it to [Developing
Requirements](../requirements/developing-requirements.md). Prefer the Surface
as candidate subject when the obligation must hold across every legitimate
realization of that encounter point. Prefer a structural subject only when the
obligation intentionally binds that runtime or responsibility boundary.

This counterfactual prevents an actor-facing obligation from being stranded on
the Component where one failure happened.

Within a Surface hierarchy, place an obligation on the narrowest subject that
fully bears it. A rule specific to one command, page, or operation may belong
to that narrower Surface. A rule that must hold across every legitimate child
may belong to the parent Surface. When the obligation concerns recognizable
behavior available through several otherwise independent Surfaces, test the
Feature as its subject rather than duplicating the rule across encounters.

## 6. Review and hand off

Walk representative scenarios through the candidate hierarchy. Check that each
actor can find the encounter point, that the hierarchy follows the accepted or
candidate interface identity policy rather than a UI or handler tree, and that
aliases and modes do not create accidental duplicate identities. Compare the
candidate set with the authoritative public interface inventory for omissions
and stale entries while preserving that inventory as realized-state evidence,
not desired-state authority. Check that material behavior is neither omitted
nor duplicated. Record evidence, alternatives, confidence, decision authority,
recommendation, and blocking status using the shared guide.

After the applicable authority accepts the Surface identity, boundary, and
material relationships, use [Documenting surfaces](documenting-surfaces.md) to
record only the accepted concepts and earned navigation.

## Final check

- The candidate is recognizable to actors and maintainers independently of its
  current implementation.
- The applicable interface identity policy is explicit, accepted or visibly
  candidate, and applied consistently.
- Surface hierarchy models interaction, not C4 or source-code containment.
- Aliases, flags, modes, handlers, and test nodes do not create accidental
  Surface identities.
- Features, Use Cases, and C4 elements retain their separate meanings.
- Candidate Requirements are routed to the load-bearing subject.
- Missing or disputed interaction meaning is explicit and no candidate is
  represented as accepted.
