---
type: Reference
title: Identity, authority, and accountability
description: Connects an agent's identity, delegated authority, consequential decisions, effects, and responsible human or organization.
tags: [identity, authority, accountability, credentials, audit, delegation, provenance]
status: stable
sources:
  - id: fipa-management
    resource: https://www.fipa.org/specs/fipa00023/SC00023J.html
    title: FIPA Agent Management Specification
  - id: nist-agent-standards
    resource: https://www.nist.gov/artificial-intelligence/ai-agent-standards-initiative
    title: NIST — AI Agent Standards Initiative
  - id: anthropic-trust
    resource: https://www.anthropic.com/research/trustworthy-agents
    title: Anthropic — Building and evaluating trustworthy agents
generated: { by: "codex/gpt-5.6", at: 2026-08-14T22:24:33Z }
stale_after: 2027-02-14
---

# Identity, authority, and accountability

An agent identity should let a system and affected people determine which
deployed actor acted, under whose authority, with which configuration, and who
remains accountable.

Separate:

- **runtime identity** — the concrete agent instance, version, session, and
  execution principal;
- **represented identity** — any person, team, or organization the agent may
  speak or act for;
- **authority** — allowed resources and operations, scoped by environment,
  duration, purpose, and consequence;
- **responsibility** — the outcomes and decisions assigned to the agent;
- **accountability** — the human or organization answerable for deployment,
  oversight, redress, and control.

Do not give an agent a shared human credential when a distinct, scoped service
identity can preserve attribution and revocation. Bind delegated authority to a
task and expiry; do not let a handoff silently widen it. Log consequential
decisions and effects without storing secrets or sensitive reasoning.

Classical standards already distinguish agent identity, ownership, management,
and lifecycle.[^fipa-management] NIST's current initiative highlights agent
authentication, identity infrastructure, secure interoperability, and security
evaluation as active standardization needs.[^nist-agent-standards]

Accountability cannot be delegated to the model. Agents may supply evidence
and explanations, but responsible institutions must provide correction,
appeal, incident response, and retirement paths. Trustworthy-agent guidance
similarly treats human control, alignment, secure interaction, transparency,
and privacy as separate properties.[^anthropic-trust]

[^fipa-management]: FIPA Agent Management Specification
[^nist-agent-standards]: NIST — AI Agent Standards Initiative
[^anthropic-trust]: Anthropic — Building and evaluating trustworthy agents
