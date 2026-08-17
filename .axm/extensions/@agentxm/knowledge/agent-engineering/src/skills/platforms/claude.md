---
type: Reference
title: Claude skill profile
description: Claude-specific authoring, evaluation, runtime, and enterprise review guidance layered on the portable core.
tags: [agent-skills, claude, anthropic, compatibility]
status: stable
stale_after: 2027-02-14
generated: { by: "codex/gpt-5.6", at: 2026-08-14T19:36:04Z }
sources:
  - id: anthropic-best-practices
    resource: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
    title: Anthropic — Skill authoring best practices
  - id: anthropic-enterprise
    resource: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/enterprise
    title: Anthropic — Enterprise skill security
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

Treat downloaded skills as untrusted software. Enterprise review should account
for network access, credentials, data handling, dependencies, update paths, and
the consequences of automatic selection.[^anthropic-enterprise]

[^anthropic-best-practices]: Anthropic — Skill authoring best practices
[^anthropic-enterprise]: Anthropic — Enterprise skill security

