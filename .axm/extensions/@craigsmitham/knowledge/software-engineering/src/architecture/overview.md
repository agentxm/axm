---
type: Explanation
title: Software architecture overview
description: What software architecture owns, what it deliberately leaves to other authorities, and how it relates desired structure to current implementation.
tags: [software-architecture, system-design, desired-state, boundaries, explanation]
status: draft
sources:
  - id: iso-42010
    resource: https://www.iso.org/standard/74393.html
    title: ISO/IEC/IEEE 42010:2022 — Architecture description
generated:
  by: codex/gpt-5
  at: 2026-08-15T15:20:54Z
---

# Software architecture overview

Software architecture describes the durable structural decisions needed for a
system to retain its intended qualities as its implementation changes. It
explains purpose, responsibilities, boundaries, authority, invariants, and
consequential relationships among major elements.

Architecture is accepted desired state. Source code and configuration show the
current implementation. Tests and contracts establish supported behavior. A
proposal explores a possible future. When these disagree, the disagreement is
something to resolve; none silently takes over another's responsibility.

Architecture should remain useful through a substantial rewrite. It may name
stable elements and constrain their relationships, but it should not mirror a
directory tree, endpoint inventory, dependency list, or delivery plan that an
executable source can provide more accurately.

## Non-responsibilities

Architecture does not specify every implementation decision, catalog all
features, reproduce exact interfaces, or record all historical proposals. It
does not replace detailed design near the code. It preserves the meaning and
constraints that are difficult to infer locally and expensive to rediscover.

Architecture documentation is selective by necessity. ISO 42010 frames an
architecture description around stakeholders, concerns, viewpoints, and
views.[^iso-42010] The useful corpus is therefore not the largest one; it is the
one that exposes the decisions needed by its actual readers.

[^iso-42010]: ISO/IEC/IEEE 42010 defines requirements for expressing
    architecture descriptions across software, systems, enterprises, and
    related entities.
