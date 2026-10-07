---
type: Reference
title: Gemini CLI skill profile
description: Gemini CLI discovery tiers, consent, management, and extension behavior layered on the portable core.
tags: [agent-skills, gemini-cli, google, compatibility]
status: stable
stale_after: 2027-02-14
generated: { by: "codex/gpt-5.6", at: 2026-08-14T19:36:04Z }
sources:
  - id: gemini-using-skills
    resource: https://geminicli.com/docs/cli/using-agent-skills/
    title: Gemini CLI — Using Agent Skills
  - id: gemini-best-practices
    resource: https://geminicli.com/docs/cli/skills-best-practices/
    title: Gemini CLI — Skills best practices
---

# Gemini CLI skill profile

Gemini CLI discovers skills from extension, user, and workspace tiers, then
loads their full instructions on activation with user-visible consent. Its
management commands expose discovered skills and their state; consult current
documentation for exact commands and precedence.[^gemini-using-skills]

Design implications:

- descriptions must support useful discovery before activation;
- instructions should still disclose material effects even when activation has
  a consent boundary;
- relative files must survive extension packaging, not only a source checkout;
- conflicts across tiers should be exercised with realistic neighboring names;
- extension-bundled skills must not assume unrelated user or workspace skills.

Follow the host's current concision and progressive-disclosure guidance, then
test the packaged extension and each claimed discovery tier.[^gemini-best-practices]

[^gemini-using-skills]: Gemini CLI — Using Agent Skills
[^gemini-best-practices]: Gemini CLI — Skills best practices

