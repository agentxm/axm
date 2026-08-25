---
type: Explanation
title: Intent-to-feedback loop
description: How signals move through work items, Requirements, architecture, realization, evaluation, and operational feedback while preserving authority boundaries.
tags: [intent, work-items, requirements, architecture, implementation, evaluations, feedback]
sources:
  - id: fowler-generative-stack
    resource: https://chadfowler.com/regenerative-software/3miwhqqvwxc2x/
    title: Chad Fowler — The Generative Stack
---

# Intent-to-feedback loop

Software change is a loop, but not a pipeline in which every downstream fact
becomes upstream truth.

| Stage | Owns | Must not imply |
| --- | --- | --- |
| Signal or request | Originating demand, anomaly, or observation | Acceptance, priority, or solution |
| Work item | Current lifecycle state, evidence, relationships, and proposed impact | An accepted Requirement or architecture decision |
| Requirement | One accepted obligation of a named subject | Its implementation or satisfaction |
| Architecture response | Responsibility, boundary, decision, and structural response | A second normative obligation |
| Realization | Current code, configuration, schemas, and deployed structure | Desired state merely because it exists |
| Evaluation | A defined assessment and bounded result | Governance approval or automatic intent change |
| Operational feedback | Observed behavior and consequences | A new Requirement without acceptance |

Feedback can expose a defect, an ambiguous Requirement, a stale evaluation, an
incorrect architecture response, changed external conditions, or changed
intent. Preserve that contradiction until an authorized decision classifies
it. Then update the responsible authority and propagate the consequences
forward again.

The result is a causal intent graph rather than a brittle one-way traceability
matrix. Stable identifiers and typed relationships let tools build useful
views, but the relationships remain meaningful because each node keeps its own
authority and lifecycle.

[^fowler-generative-stack]: Fowler's essay supplies the motivating layered
    pipeline and feedback direction; this concept adds explicit lifecycle and
    authority boundaries for the package.
