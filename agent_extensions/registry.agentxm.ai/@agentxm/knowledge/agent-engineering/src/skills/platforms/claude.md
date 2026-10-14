---
type: Reference
title: Claude skill profile
description:
  Claude-specific authoring, evaluation, runtime, and enterprise review guidance
  layered on the portable core.
tags: [agent-skills, claude, anthropic, compatibility, selection-behavior]
status: stable
stale_after: 2027-02-22
generated: { by: "codex/gpt-6", at: 2026-10-01T03:12:00Z }
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
  - id: claude-code-hooks
    resource: https://code.claude.com/docs/en/hooks
    title: Claude Code — Hooks reference
---

# Claude skill profile

## Product and runtime scope

Name the Claude product and execution surface before applying host-specific
guidance. A skill used through Claude Code, a hosted Claude application, or an
API integration does not automatically have the same tools, filesystem,
permissions, or extension discovery.

Claude Code documents command, HTTP, MCP-tool, prompt, and agent hook handlers,
with event-specific restrictions. An agent hook runs an agentic verifier; it is
distinct from a single-turn prompt handler. A handler listed in the schema does
not establish support for every event.[^claude-code-hooks] Use the
[Agent Capability Catalog](https://github.com/agentxm/axm/blob/main/packages/core/extension-model/src/unstable/agent-capabilities/data/agents/README.md)
for current native and AXM delivery qualifications rather than interpreting this
authoring profile as an installation matrix.

The 2026-10-01 review covers these hook and surface distinctions. The authoring
and selection guidance below retains its prior source scope; this review did not
execute a vendor runtime or repeat those behavioral evaluations.

## Skill authoring

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
paid for in false positives, which are the more expensive failure once a catalog
holds neighboring skills, and a description that promises more than the skill
delivers is a defect on any host. Widen trigger coverage with recognizable
capability language, not with claims the destination cannot fulfill.

Treat downloaded skills as untrusted software. Enterprise review should account
for network access, credentials, data handling, dependencies, update paths, and
the consequences of automatic selection.[^anthropic-enterprise]

[^anthropic-best-practices]: Anthropic — Skill authoring best practices

[^anthropic-enterprise]: Anthropic — Enterprise skill security

[^anthropic-skill-creator]: Anthropic — Skill Creator

[^claude-code-hooks]: Claude Code — Hooks reference
