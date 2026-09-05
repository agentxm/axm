---
type: Explanation
title: Skill library governance model
description: How automation, distributed ownership, independent review, and runtime enforcement govern a skill library without centralizing every decision.
tags: [agent-skills, governance, automation, human-in-the-loop, authority]
status: stable
stale_after: 2027-02-14
generated: { by: "codex/gpt-5.6", at: 2026-08-14T19:57:04Z }
sources:
  - id: skill-centric-harness
    resource: https://www.youtube.com/watch?v=7jjudsEhBtM&t=820s
    title: Skills are new features — Building Skill-Centric Harness
  - id: anthropic-enterprise
    resource: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/enterprise
    title: Anthropic — Skills for enterprise
  - id: backstage-catalog
    resource: https://backstage.io/docs/features/software-catalog/
    title: Backstage Software Catalog
---

# Skill library governance model

Skill governance is the system of decision rights, evidence, controls, and
feedback that determines which skills exist, who maintains them, what they may
do, which versions may run, and whether the library remains coherent. It becomes
necessary before an arbitrary count when skills cross teams, activate
implicitly, or receive consequential authority. Scale makes automation and
portfolio controls load-bearing rather than creating the need itself.

The five recurring responsibilities are admission, ownership, capability
boundaries, lifecycle, and coherence.[^skill-centric-harness] Treat them as one
control loop:

```text
proposal -> automated evidence -> responsible human decision -> bounded exposure
    ^                                                        |
    +-------- observation, drift, change, deprecation --------+
```

## Three authorities

| Authority | Owns | Must not own |
| --- | --- | --- |
| Package source | Purpose, contracts, requested capabilities, dependencies, version | Its own approval or runtime entitlement |
| Governance system | Admission state, risk tier, reviewers, exceptions, evaluated identity, evidence expiry | Rewriting the package invisibly |
| Harness or host | Effective tools, data, identity, sandbox, approvals, logging | Redefining what the skill claims to do |

Keep these authorities distinct. A package cannot become approved by editing
its own metadata, and a registry entry cannot prove runtime enforcement.

## Automation with human authority

Automate facts and repeatable policy: structure, provenance, dependency and
capability diffs, evaluation results, evidence freshness, ownership resolution,
and catalog conflicts. Route consequential judgment to accountable people:
whether a capability deserves to exist, who accepts stewardship, whether an
overlap should merge, whether an exception is justified, and when consumers
must migrate. Anthropic likewise recommends evaluation gates, separation of
duties, and an internal registry rather than author self-approval.[^anthropic-enterprise]

Ownership should remain with the team closest to the workflow; a library
steward owns policy, catalog health, and cross-team conflicts. This mirrors the
catalog pattern in which metadata remains near source and responsible teams
maintain it while central processors apply common policies.[^backstage-catalog]

[^skill-centric-harness]: Skills are new features — Building Skill-Centric Harness
[^anthropic-enterprise]: Anthropic — Skills for enterprise
[^backstage-catalog]: Backstage Software Catalog

