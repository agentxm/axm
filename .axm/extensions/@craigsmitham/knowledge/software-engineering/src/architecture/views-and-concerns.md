---
type: Explanation
title: Views and concerns
description: Why architecture uses concern-specific views and how to keep multiple views from becoming competing models of the system.
tags: [architecture-views, viewpoints, stakeholders, concerns, communication]
status: draft
sources:
  - id: iso-42010-conceptual-model
    resource: https://www.iso-architecture.org/ieee-1471/cm/
    title: ISO/IEC/IEEE 42010 conceptual model
generated:
  by: codex/gpt-5
  at: 2026-08-15T15:20:54Z
---

# Views and concerns

No single diagram or document can answer every architectural question. A view
selects the relationships needed to address one or more stakeholder concerns;
a viewpoint establishes the conventions used to construct that
view.[^iso-42010-conceptual-model]

Useful concerns include responsibility, runtime interaction, state, trust,
deployment, and change. They are perspectives on one architecture, not
automatically separate folder trees or models.

Create a view when the relationship has independent significance and cannot be
understood easily from existing material. A deployment view may be essential
for a distributed system and noise for a single-process tool. A trust view may
cross several product surfaces without owning their individual behavior.

Multiple views must share stable element names and authority. If one view says
an element owns a decision and another assigns it elsewhere, the corpus contains
a contradiction rather than useful plurality.

Views are communication devices, not inventories. Include enough detail to
resolve the concern and link back to the concept that owns each substantive
claim.

[^iso-42010-conceptual-model]: The ISO 42010 conceptual model relates
    stakeholders and concerns to viewpoints, views, and architecture models.
