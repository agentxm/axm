---
type: Explanation
title: Composing with work management
description: Defines the boundary between authoritative requirements and the work items used to investigate or change them.
tags: [work-management, change, defect-report, traceability, composition, pe-solution]
sources:
  - id: requirements-boundary
    resource: ../foundations/requirements-and-neighboring-artifacts.md
    title: Requirements and neighboring artifacts
  - id: work-item-taxonomy
    resource: ../../../delivery/work-items/software-work-item-taxonomy.md
    title: Software work-item taxonomy
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Composing with work management

Requirements engineering and work management are independent capabilities that
compose through explicit relationships.[^requirements-boundary] The portable
meanings of the roles named below are owned by [How to ship
it](../../../delivery/work-items/), which treats Operational Incident Records,
Defect Reports, and Changes as durable case records.[^work-item-taxonomy]

Holding both capabilities in one body of knowledge does not merge them. A
requirement keeps its own authority, identity, and decision history whatever
record coordinates work around it, and a work item keeps its own lifecycle
whatever obligation it cites.

- A Defect Report may cite the requirement or intended use against which a
  suspected deficiency was observed.
- A Change may propose, authorize, or coordinate a requirement revision and its
  downstream realization.
- An Operational Incident Record may provide evidence that a requirement,
  assumption, realization, or verification strategy needs review.
- A requirement may link to these records as provenance or change context while
  retaining its own authoritative identity and decision history.

Do not copy the requirement into a work item as a competing authority. Do not
infer that reported behavior is a defect, that a proposed change is approved,
or that delivery changes normative requirement text. A project that coordinates
work through its own native records rather than these portable roles applies
the same semantic boundary to whatever records it has.

## Worked continuation

The [Northbank obligation specimens](../authoring/northbank-commitment-requirements.md)
and [receipt records](../../../delivery/work-items/northbank-receipt-incident.md)
show the boundary: `NB-RECEIPT-01` owns financial replay meaning, while the
corrective Change owns its bounded work and verification. An incident can be
restored while the defect and Change remain active. Moving those records into
a tracker does not transfer requirement authority to its status field.

[^requirements-boundary]: The cited boundary distinguishes an authoritative
    requirement from the records that coordinate work around it, and lists
    which portable guide owns each concern for each artifact.
[^work-item-taxonomy]: The cited taxonomy owns portable meanings for Defect
    Reports, Changes, and Operational Incident Records.
