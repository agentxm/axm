---
type: Explanation
title: Composing with work management
description: Defines an optional boundary between authoritative requirements and the work items used to investigate or change them.
tags: [work-management, change, defect-report, traceability, composition]
sources:
  - id: requirements-boundary
    resource: ../foundations/requirements-and-neighboring-artifacts.md
    title: Requirements and neighboring artifacts
  - id: work-management
    resource: https://github.com/craigsmitham/agent-extensions/tree/d2456818304424ab7cfac01305478ae214eaaad5/knowledge/work-management
    title: Work management knowledge
generated: { by: codex/gpt-5.6, at: 2026-08-29T20:06:39Z }
---

# Composing with work management

Requirements Engineering and Work Management are independent capabilities that
compose through explicit relationships.[^requirements-boundary] The portable
work-item meanings are defined by the separate Work Management bundle.[^work-management]

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
or that delivery changes normative requirement text. When the Work Management
pack is absent, use the project's native coordination records with the same
semantic boundary.

[^requirements-boundary]: The cited boundary distinguishes an authoritative
    requirement from the records that coordinate work around it.
[^work-management]: The cited bundle owns portable meanings for Defect Reports,
    Changes, and Operational Incident Records.
