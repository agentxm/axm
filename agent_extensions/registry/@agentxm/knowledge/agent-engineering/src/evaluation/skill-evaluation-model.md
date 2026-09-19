---
type: Explanation
title: Agent Skill evaluation model
description: How skill evaluation specializes general evaluation through independent routing, activated execution, and coexistence evidence.
tags: [agent-skills, evaluation, evidence, contracts]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-22T22:33:39Z }
stale_after: 2027-02-14
sources:
  - id: anthropic-best-practices
    resource: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
    title: Anthropic — Skill authoring best practices
---

# Agent Skill evaluation model

Skill evaluation applies general evaluation practice to a discoverable,
packaged workflow. Bind evidence to an exact skill revision, host, model,
configuration, available catalog, fixture set, and time: behavior is produced
by their interaction, not by `SKILL.md` alone. Anthropic likewise recommends
evaluating skills on their intended models.[^anthropic-best-practices]

Evaluate two independent stages:

1. **Routing** — whether metadata selects the skill for intended work and
   rejects neighboring work.
2. **Execution** — whether an already activated skill completes its promised
   job within its authority.

Then grade the skill-specific contract: outcome, instruction adherence,
packaged-resource use, presentation when contractual, efficiency, authority,
recovery, and robustness. For library claims, evaluate isolation, semantic
neighbors, the actual active cohort, and the previous accepted revision. The
active cohort is observation context for routing, coexistence, and compatibility
claims, not authority for dependency or composition claims. Required
collaboration must have independent authority in a package declaration, host
contract, or supplied workflow.

## Defensible conclusions

- **Supported** means representative evidence supports every material claim in
  the tested scope.
- **Partially supported** means useful behavior exists but a material claim or
  boundary does not hold.
- **Unsupported** means evidence contradicts a central claim.
- **Inconclusive** means the available evidence cannot decide.

Absence of an observed failure is not evidence of support.

[^anthropic-best-practices]: Anthropic — Skill authoring best practices
