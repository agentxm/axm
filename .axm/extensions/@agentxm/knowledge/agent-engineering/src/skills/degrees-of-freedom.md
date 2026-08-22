---
type: Explanation
title: Degrees of freedom
description: How task variability and fragility determine instruction and automation strictness.
tags: [agent-skills, degrees-of-freedom, judgment, scripts, safety]
status: stable
generated: { by: "claude-code/claude-opus-5", at: 2026-08-16T01:39:08Z }
stale_after: 2027-02-16
sources:
  - id: anthropic-best-practices
    resource: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
    title: Anthropic — Skill authoring best practices
---

# Degrees of freedom

Instruction strictness should follow the work's variability and fragility, not
the author's desire for control. Anthropic describes matching degrees of
freedom to the task rather than making every workflow equally prescriptive.[^anthropic-best-practices]

| Freedom | Appropriate when                                                      | Typical form                                             |
| ------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| High    | Several approaches are valid and context determines the choice        | Goals, heuristics, decision criteria                     |
| Medium  | A preferred pattern exists but inputs or environment vary             | Ordered workflow, bounded options, parameterized helper  |
| Low     | Mechanics are fragile, exact, security-sensitive, or repeatedly wrong | Deterministic script, strict template, narrow parameters |

Assign freedom per surface, not once for the whole skill. Discovery and
analysis may require broad judgment while execution mechanics, presentation
order, or validation remain exact. Constrain only the surface whose variation
causes failure.

Freedom also divides within a single template. A template holds fixed tokens and
fillable slots, and a nearby instruction to adapt detail applies only to the
slots. Mark the difference explicitly: identifiers, labels, and status
vocabularies are usually the low-freedom tokens, and unmarked ones drift even
when the surrounding workflow is followed exactly.

## Two opposite failures

- **Underconstraint** makes the agent rediscover fragile mechanics, improvise
  authority, or omit required evidence.
- **Overconstraint** encodes incidental steps, blocks adaptation, increases
  context cost, and fails when harmless environment details change.

Place judgment in instructions and exact transformations in code. A script
should narrow mechanics, not hide a policy decision the workflow has not made.

[^anthropic-best-practices]: Anthropic — Skill authoring best practices
