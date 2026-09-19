---
type: Reference
title: Capability boundaries and risk tiers
description: How declared, approved, effective, and observed authority determine controls and reviewers for a skill.
tags: [agent-skills, capabilities, allowed-tools, least-privilege, risk-tier]
status: stable
stale_after: 2027-02-14
generated: { by: "codex/gpt-5.6", at: 2026-08-14T19:57:04Z }
sources:
  - id: agent-skills-spec
    resource: https://agentskills.io/specification
    title: Agent Skills specification
  - id: google-governance
    resource: https://docs.cloud.google.com/gemini-enterprise-agent-platform/govern/policies/govern-agent-skills
    title: Google Cloud — Governing Agent Skills
  - id: microsoft-agent-skills
    resource: https://learn.microsoft.com/en-us/agent-framework/agents/skills
    title: Microsoft Agent Framework — Agent Skills
---

# Capability boundaries and risk tiers

Govern four different capability sets:

| Set | Meaning |
| --- | --- |
| Requested | What the package says the job needs |
| Approved | What reviewers authorize for an exact artifact and use |
| Effective | What the host, identity, sandbox, and policy actually permit |
| Observed | What execution evidence shows the skill attempted or used |

The effective set must be no broader than the approved set. A mismatch is a
deployment defect even when the skill behaves safely in one evaluation.

The portable `allowed-tools` field is experimental and host support varies. It
describes pre-approved tools, not a universal deny-by-default maximum.[^agent-skills-spec]
Use it when supported, but record the complete capability envelope separately
and verify host enforcement.

## Capability envelope

Classify reads, writes, deletion, subprocess and code execution, network
destinations, package installation, credentials, data classes, external
mutation, persistence, impersonation, and approval bypass. Include allowed
targets and arguments, not only tool names. Combinations such as sensitive read
plus network write may be riskier than either capability alone.

## Risk-directed controls

Use local policy tiers whose names fit the organization. At minimum distinguish:

- read-only instructions and resources;
- bounded local writes or deterministic scripts;
- network, credentials, package installation, or external mutation; and
- destructive, production, privileged, or regulated-data actions.

Higher tiers require stronger isolation, provenance, evaluation, review,
runtime confirmation, monitoring, and evidence refresh. Google demonstrates
intercepting skill loading, resource access, and script execution with
context-sensitive policy.[^google-governance] Microsoft distinguishes automatic
approval of read-only skill operations from explicit approval of script
execution.[^microsoft-agent-skills]

Skill engineering owns the declared envelope, risk decision, and proof that
effective policy matches it. Harness engineering owns the runtime policy engine,
identity, sandbox, approval middleware, and telemetry implementation.

[^agent-skills-spec]: Agent Skills specification
[^google-governance]: Google Cloud — Governing Agent Skills
[^microsoft-agent-skills]: Microsoft Agent Framework — Agent Skills

