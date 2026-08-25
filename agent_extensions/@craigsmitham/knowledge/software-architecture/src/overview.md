---
type: Explanation
title: Software architecture overview
description: What software architecture owns, what it deliberately leaves to other authorities, and how it relates desired structure to current implementation.
tags:
  [software-architecture, system-design, offerings, value, desired-state, boundaries, explanation]
status: draft
sources:
  - id: iso-42010
    resource: https://www.iso.org/standard/74393.html
    title: ISO/IEC/IEEE 42010:2022 — Architecture description
generated:
  by: codex/gpt-5.6
  at: 2026-08-22T00:14:30Z
---

# Software architecture overview

Software architecture comprises the durable structural concepts, properties,
and consequential decisions by which a system retains its intended qualities
as its implementation changes. An architecture description expresses selected
parts of that architecture for particular stakeholders and concerns; the
architecture and its description are not the same thing.[^iso-42010]

Within this bundle, maintained architecture documentation records accepted
desired architectural state. A system also has an effective architecture
expressed through its implemented structure and behavior. Source code and
configuration show current implementation, tests and contracts establish
supported behavior, and a proposal explores a possible future. When these
authorities disagree, the disagreement is something to resolve; none silently
takes over another's responsibility.

Architecture should remain useful through a substantial rewrite. It may name
stable elements and constrain their relationships, but it should not mirror a
directory tree, endpoint inventory, dependency list, or delivery plan that an
executable source can provide more accurately.

Architecture may include strategic, demand-and-value, capability, behavior,
interaction, domain-authority, structural, dynamic, deployment, and quality
views when they answer real stakeholder concerns. These views describe one
system of interest; their directories and diagrams are discovery mechanisms
rather than one universal containment model.

## Non-responsibilities

Architecture does not specify every implementation decision, catalog all
features, reproduce exact interfaces, or record all historical proposals. It
does not replace detailed design near the code. It preserves the meaning and
constraints that are difficult to infer locally and expensive to rediscover.

Architecture documentation is selective by necessity. ISO 42010 frames an
architecture description around stakeholders, concerns, viewpoints, and
views.[^iso-42010] A useful set of architecture docs is therefore not the largest one; it is the
one that exposes the decisions needed by its actual readers.

[^iso-42010]:
    ISO/IEC/IEEE 42010 defines requirements for expressing
    architecture descriptions across software, systems, enterprises, and
    related entities.
