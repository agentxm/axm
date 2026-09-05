---
type: Reference
title: Execution evaluations
description: Cases and evidence for instructions, resources, outcomes, recovery, and authority after activation.
tags: [agent-skills, evaluation, execution, authority]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T20:25:35Z }
stale_after: 2027-02-14
sources:
  - id: anthropic-best-practices
    resource: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
    title: Anthropic — Skill authoring best practices
---

# Execution evaluations

Activate the skill explicitly so routing cannot conceal destination defects.
Give it only declared inputs and task-local fixtures, then grade observable
results rather than persuasive narration. Representative examples and skill
evaluations should cover realistic success and failure behavior.[^anthropic-best-practices]

Cover the happy path, an important edge, a missing or malformed input, a tool or
resource failure, and a request beyond the skill's authority. Where scripts or
templates are contractual, verify that the skill discovers and uses them by
relative path and handles their failure honestly.

Evidence should answer:

- Did the promised artifact or state appear and satisfy its contract?
- Did the workflow follow required ordering and validation gates?
- Were side effects, permissions, and user decisions kept within scope?
- Did recovery preserve data and expose uncertainty?
- Was the work materially more reliable or efficient than the baseline?

When presentation is contractual, preserve and grade the final user-visible
response separately from intermediate correctness. Check required relative
order, labels, parallel fields, uniqueness, status, and final handoff directly;
content presence does not excuse a structural failure. For option comparisons,
vary which position is recommended so the cases do not teach a positional
shortcut.

Keep evaluator failures distinct from skill failures. An unavailable host,
credential, or fixture yields an untested expectation, not a passing one.

[^anthropic-best-practices]: Anthropic — Skill authoring best practices
