---
name: assess
description: Assess maintenance health and prioritize worthwhile interventions in a codebase or specified scope; assessment only.
disable-model-invocation: true
---

Assess the requested scope and identify the most worthwhile maintenance
interventions. Establish intended purpose, supported uses, applicable
requirements, and the decisions the assessment should inform.

Consider the concerns relevant to that scope:

- Behavior and data integrity: recurring defects, incorrect results, broken
  contracts, and failure or recovery conditions.
- Security: exposed weaknesses, unsafe trust assumptions, dependencies, and
  build or release integrity.
- Verification and delivery: meaningful tests, reproducible builds, reliable
  environments, feedback delay, and failures hidden by retries or skips.
- Lifecycle and compatibility: support deadlines, deprecated contracts,
  dependency networks, and unfinished migrations.
- Structure and changeability: cohesion, coupling, ownership, comprehension,
  and the effort required for representative changes.
- Unnecessary burden: obsolete elements, excessive mechanisms, repeated
  knowledge, and opportunities for suitable reuse.
- Operation and efficiency: manual interventions, diagnostics, recovery,
  resource costs, and qualities important to users.
- Knowledge and obligations: accurate instructions, coherent examples and
  schemas, ownership, and support commitments.

Use history, observed failures, intended changes, and maintainer experience
alongside tools and static inspection. A smell or metric is a signal to
investigate. Similar code, old code, or absent local references alone do not
establish waste. Preserve legitimate variation and independent policies.

For supported findings, identify concrete locations and evidence, the burden
or risk, the obligation to preserve, a plausible intervention, expected benefit,
transition and ongoing costs, prerequisites, and material uncertainty. Compare
with retaining the current arrangement, including costs shifted to consumers.
Prioritize by consequence, recurrence, expected future change, net benefit,
intervention risk, and confidence. Urgent failures or support deadlines may
override otherwise attractive cleanup; avoid an invented composite score.

Present a small, actionable set appropriate to the requested breadth and
limits. Distinguish supported findings from investigation candidates, and
identify what was assessed, not assessed, or inapplicable. Missing evidence
does not establish health or defect. Recommend the next intervention and
its prerequisites without requiring a particular tool or another skill.

Report when no intervention is justified. Assessment only: do not modify
the subject, create work items, or automatically begin implementation.
