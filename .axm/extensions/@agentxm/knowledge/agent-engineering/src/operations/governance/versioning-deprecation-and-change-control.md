---
type: Reference
title: Versioning, deprecation, and change control
description: How a skill's public contract drives semantic versions, reapproval, migration, deprecation, revocation, and retirement.
tags: [agent-skills, semantic-versioning, changelog, deprecation, change-control]
status: stable
stale_after: 2027-02-14
generated: { by: "codex/gpt-5.6", at: 2026-08-14T19:57:04Z }
sources:
  - id: semver
    resource: https://semver.org/
    title: Semantic Versioning 2.0.0
  - id: anthropic-enterprise
    resource: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/enterprise
    title: Anthropic — Skills for enterprise
  - id: secure-agent-skills
    resource: https://arxiv.org/abs/2604.02837
    title: Towards Secure Agent Skills — Architecture, Threat Taxonomy, and Security Analysis
---

# Versioning, deprecation, and change control

Semantic versioning is meaningful only after declaring the public contract.[^semver]
For a skill, that contract includes:

- positive, negative, and explicit activation behavior;
- inputs, outputs, completion evidence, and failure semantics;
- authority and side-effect envelope;
- required tools, dependencies, data, and environment;
- supported hosts and models; and
- consumer-facing compatibility and migration expectations.

## Version classification

| Change                                                                | Version intent |
| --------------------------------------------------------------------- | -------------- |
| Correction with no public-contract or authority change                | Patch          |
| Backward-compatible capability inside the approved authority envelope | Minor          |
| Incompatible routing, input, output, requirement, or behavior change  | Major          |

Version compatibility and governance risk are separate. Expanded authority,
new network destinations, credential or data classes, executable dependencies,
production environments, publisher identity, or provenance require re-audit
and reapproval regardless of SemVer class. A change to model or host behavior
may require new evidence even when package bytes do not change.

## Change record

Every release should identify the previous version, contract and risk deltas,
affected cohorts, evaluation and audit evidence, migration, rollback, and
changelog. Promote only the exact evaluated artifact. Anthropic recommends the
full evaluation suite before promoting a new version and deprecation when
persistent failures or retired workflows make the skill unsuitable.[^anthropic-enterprise]

Use lifecycle states deliberately:

- `experimental` limits exposure while evidence accumulates;
- `approved` permits named cohorts and effective policy;
- `deprecated` warns consumers, names a successor and deadline, and blocks new
  adoption by default;
- `revoked` disables exposure immediately for safety or trust loss; and
- `retired` records completed removal and retained provenance.

Approval is bound to an exact artifact, not inherited forever by name. Research
on Agent Skill security identifies persistent trust after one approval as a
structural weakness.[^secure-agent-skills]

[^semver]: Semantic Versioning 2.0.0

[^anthropic-enterprise]: Anthropic — Skills for enterprise

[^secure-agent-skills]: Towards Secure Agent Skills — Architecture, Threat Taxonomy, and Security Analysis
