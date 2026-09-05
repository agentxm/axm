---
type: Guide
title: Classifying Changes
description: Use when a Change needs a truthful purpose classification without treating labels as diagnosis, priority, or authorization.
tags: [change, classification, bugfix, feature, improvement, maintenance, migration]
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:30:08Z }
---

# Classifying Changes

Classification helps filtering, reporting, and applying local policy. It does
not establish priority, approval, scope, diagnosis, or completion.

## Classify from purpose

Use the smallest local classification vocabulary that changes handling. Common
examples include:

| Classification | Primary purpose |
| --- | --- |
| Bugfix | Correct or acceptably compensate for one or more established Defects |
| Feature | Introduce recognizable behavior or capability |
| Improvement | Improve an existing outcome without correcting an established Defect |
| Maintenance | Preserve operability, supportability, or maintainability without a user-visible outcome being primary |
| Migration | Move data, traffic, interfaces, consumers, or implementation from one supported state to another |

These examples are not a required universal enumeration. Prefer the consuming
project's accepted classifications and definitions when they exist.

## Avoid invalid inference

- A `bug` label does not establish a Defect or make the Change a Bugfix.
- A source Defect Report does not authorize remediation.
- Mixed implementation tasks do not necessarily require several
  classifications if the Change still has one coherent purpose.
- Material independent purposes may justify splitting the Change rather than
  assigning a pile of labels.

Record classification authority and rationale when the decision is
consequential or disputed. Map the result to a native type or field when its
semantics match; otherwise use a label or brief body statement as a projection.
