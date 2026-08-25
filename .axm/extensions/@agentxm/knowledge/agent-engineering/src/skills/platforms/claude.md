---
type: Reference
title: Claude skill profile
description: Claude-specific authoring, evaluation, runtime, and enterprise review guidance layered on the portable core.
tags: [agent-skills, claude, anthropic, compatibility, selection-behavior]
status: stable
stale_after: 2027-02-22
generated: { by: "claude-code/claude-opus-5", at: 2026-08-22T14:21:16Z }
sources:
  - id: anthropic-best-practices
    resource: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
    title: Anthropic — Skill authoring best practices
  - id: anthropic-enterprise
    resource: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/enterprise
    title: Anthropic — Enterprise skill security
  - id: anthropic-skill-creator
    resource: https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md
    title: Anthropic — Skill Creator
---

# Claude skill profile

Claude's guidance emphasizes concise descriptions, progressive disclosure,
relative references, useful scripts, and evaluation on the models a skill is
intended to support.[^anthropic-best-practices]

Authoring implications:

- write descriptions in third person with both capability and trigger context;
- keep references directly reachable and avoid deeply nested discovery chains;
- choose instruction specificity according to task risk and permissible
  variation;
- create at least three representative evaluations, including negative or edge
  behavior, before claiming support;
- review the entire package statically before enterprise deployment, including
  scripts and files that are not mentioned by the entry point.

## Observed selection behavior

Claude consults a skill for work it cannot already complete directly, so a
precise description can still go unselected on requests the assistant handles
unaided.[^anthropic-skill-creator] Treat that as a fact about case design:
one-step requests are poor routing cases because they cannot demonstrate
selection either way.

Anthropic reports a tendency to under-select skills and suggests writing
descriptions assertively enough to overcome it. Adopt that only as far as the
portable routing contract allows. Recall bought by broadening a description is
paid for in false positives, which are the more expensive failure once a
catalog holds neighboring skills, and a description that promises more than the
skill delivers is a defect on any host. Widen trigger coverage with recognizable
capability language, not with claims the destination cannot fulfill.

Treat downloaded skills as untrusted software. Enterprise review should account
for network access, credentials, data handling, dependencies, update paths, and
the consequences of automatic selection.[^anthropic-enterprise]

[^anthropic-best-practices]: Anthropic — Skill authoring best practices

[^anthropic-enterprise]: Anthropic — Enterprise skill security

[^anthropic-skill-creator]: Anthropic — Skill Creator
