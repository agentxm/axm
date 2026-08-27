---
type: Explanation
title: Software architecture overview
description: What software architecture owns, what it deliberately leaves to other authorities, and how it relates desired structure to current implementation.
tags: [software-architecture, system-design, offerings, value, desired-state, boundaries, explanation]
status: draft
sources:
  - id: iso-42010
    resource: https://www.iso.org/standard/74393.html
    title: ISO/IEC/IEEE 42010:2022 — Architecture description
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T20:07:37Z
---

# Software architecture overview

> **Authority:** The [Gen Stack vocabulary and relationship
> model](/glossary.md) is authoritative for canonical terms and relationships.
> This Explanation develops understanding without redefining them. When it
> discusses a profile-governed corpus representation, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) governs that representation.
> This document adds neither semantic authority nor profile-conformance rules.

Software architecture comprises the durable structural concepts, properties,
and consequential decisions by which a system retains its intended qualities
as its implementation changes. An architecture description expresses selected
parts of that architecture for particular stakeholders and concerns; the
architecture and its description are not the same thing.[^iso-42010]

Within this bundle, Intent concepts record desired outcomes, motivations,
actor goals, scenarios, and problem-space distinctions. Architecture concepts
record accepted subjects, responsibilities, relationships, decisions, and
response meaning. Requirement concepts alone canonically record accepted
obligations arising from Intent or another recognized source and assigned to
the documented System or another eligible Architecture subject.

Intent shapes both Architecture and Requirements, and they are co-developed.
Candidate Architecture supplies the subjects, boundaries, responsibilities,
interactions, and response hypotheses needed to formulate useful obligations;
candidate Requirements test, constrain, and refine that shape. Once accepted,
Architecture owns the subject and response while each Requirement owns its
obligation. Their semantic separation prevents competing authority; it does
not imply independent development or a universal Architecture-first or
Requirements-first sequence.

[Developing candidate Architecture and
Requirements](developing-candidate-architecture-and-requirements.md) provides
the shared greenfield and brownfield workflow for evidence extraction, gap
classification, subject placement, authority, and blocking status. Its
Surface, C4 structure, and Requirement specializations keep the element
distinctions explicit. The corresponding `Documenting ...` guides begin only
after the applicable meaning is accepted.

A system also has an effective architecture expressed through its implemented
structure and behavior. Source code and configuration show current
implementation, tests and contracts establish supported behavior, and a
proposal explores a possible future. When these authorities disagree, the
disagreement is something to resolve; none silently takes over another's
responsibility.

Architecture should remain useful through a substantial rewrite. It may name
stable elements and constrain their relationships, but it should not mirror a
directory tree, endpoint inventory, dependency list, or delivery plan that an
executable source can provide more accurately.

The Gen Stack corpus may include strategic, demand-and-value, capability,
behavior, interaction, domain-authority, structural, dynamic, deployment, and
quality views when they answer real stakeholder concerns. Corpus membership
does not make every view an Architecture concept or eligible Requirement
subject. These views describe one documented System; their directories and
diagrams are discovery mechanisms rather than one universal containment model.

## Non-responsibilities

Architecture does not specify every implementation decision, catalog all
features, reproduce exact interfaces, or record all historical proposals. It
does not replace detailed design near the code. It preserves the meaning and
structural response that are difficult to infer locally and expensive to
rediscover, while accepted binding constraints remain Requirements.

[Change Design](/design/change-design.md) owns the proportional technical
response for one bounded change. It may work within current Architecture,
propose an Architecture impact for separate acceptance, or apply an accepted
ADR without turning every implementation choice into durable Architecture.

Architecture documentation is selective by necessity. ISO 42010 frames an
architecture description around stakeholders, concerns, viewpoints, and
views.[^iso-42010] A useful set of architecture docs is therefore not the largest one; it is the
one that exposes the decisions needed by its actual readers.

[^iso-42010]: ISO/IEC/IEEE 42010 defines requirements for expressing
    architecture descriptions across software, systems, enterprises, and
    related entities.
