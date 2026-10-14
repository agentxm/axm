---
type: Reference
title: Gemini CLI skill profile
description:
  Gemini CLI discovery tiers, consent, management, and extension behavior
  layered on the portable core.
tags: [agent-skills, gemini-cli, google, compatibility]
status: stable
stale_after: 2027-02-14
generated: { by: "codex/gpt-6", at: 2026-10-01T03:12:00Z }
sources:
  - id: gemini-using-skills
    resource: https://geminicli.com/docs/cli/using-agent-skills/
    title: Gemini CLI — Using Agent Skills
  - id: gemini-best-practices
    resource: https://geminicli.com/docs/cli/skills-best-practices/
    title: Gemini CLI — Skills best practices
  - id: gemini-transition
    resource: https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/
    title: Google — Transitioning Gemini CLI to Antigravity CLI
  - id: antigravity-subagents
    resource: https://antigravity.google/docs/subagents/
    title: Antigravity — Custom subagents
---

# Gemini CLI skill profile

## Product and edition scope

Gemini CLI's consumer edition retired on 2026-06-18; Standard, Enterprise, and
paid API-key access continue. The consumer transition to Antigravity CLI does
not establish complete feature parity. Keep Gemini CLI, Antigravity CLI, and
Antigravity's desktop surface distinct when claiming extension
behavior.[^gemini-transition]

Antigravity documents custom subagent definitions as well as built-in
delegation.[^antigravity-subagents] Consult the
[Agent Capability Catalog](https://github.com/agentxm/axm/blob/main/packages/core/extension-model/src/unstable/agent-capabilities/data/agents/README.md)
for current identity, scope, discovery, and AXM delivery conditions. A shared
harness does not establish that every older IDE configuration or user-scoped
installation is supported.

This lifecycle and surface review was performed on 2026-10-01 from the cited
sources. It does not recertify the discovery and consent behavior below or
establish vendor-runtime verification.

## Skill authoring

Gemini CLI discovers skills from extension, user, and workspace tiers, then
loads their full instructions on activation with user-visible consent. Its
management commands expose discovered skills and their state; consult current
documentation for exact commands and precedence.[^gemini-using-skills]

Design implications:

- descriptions must support useful discovery before activation;
- instructions should still disclose material effects even when activation has a
  consent boundary;
- relative files must survive extension packaging, not only a source checkout;
- conflicts across tiers should be exercised with realistic neighboring names;
- extension-bundled skills must not assume unrelated user or workspace skills.

Follow the host's current concision and progressive-disclosure guidance, then
test the packaged extension and each claimed discovery
tier.[^gemini-best-practices]

[^gemini-using-skills]: Gemini CLI — Using Agent Skills

[^gemini-best-practices]: Gemini CLI — Skills best practices

[^gemini-transition]: Google — Transitioning Gemini CLI to Antigravity CLI

[^antigravity-subagents]: Antigravity — Custom subagents
