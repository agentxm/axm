---
type: Reference
title: Skill governance record
description: The authored claims, independent decisions, runtime facts, and evidence identities needed to govern one skill over time.
tags: [agent-skills, governance-record, registry, provenance, lifecycle]
status: stable
stale_after: 2027-02-14
generated: { by: "codex/gpt-5.6", at: 2026-08-14T19:57:04Z }
sources:
  - id: anthropic-enterprise
    resource: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/enterprise
    title: Anthropic — Skills for enterprise
  - id: backstage-catalog
    resource: https://backstage.io/docs/features/software-catalog/
    title: Backstage Software Catalog
  - id: slsa-provenance
    resource: https://slsa.dev/spec/v1.0/provenance
    title: SLSA provenance
---

# Skill governance record

A governance record binds decisions to an exact artifact and intended use. It
is a logical model, not a required portable filename. Store fields in the
package manifest, source repository, registry, policy system, or evidence store
according to who has authority to change them.

## Minimum record

| Class | Fields |
| --- | --- |
| Identity | Canonical name, version, source revision, archive digest, publisher, acquisition path |
| Authored contract | Purpose, positive and negative scope, public contract, requested capabilities, dependencies, supported hosts and models |
| Stewardship | Responsible team, backup or escalation route, support expectation, review cadence |
| Governance | Lifecycle state, risk tier, effective capability policy, reviewers, decision, conditions, exceptions, expiry |
| Evidence | Evaluation and audit identities, environments, dates, results, raw-evidence locators, unresolved claims |
| Relationships | Replaces, supersedes, conflicts with, composes with, consumers, active cohorts |
| Change | Previous identity, compatibility class, risk delta, changelog, migration and rollback |
| Operation | Deployment or installation versions, activation and outcome signals, incidents, last observed use |

Anthropic's enterprise registry guidance names purpose, owner, version,
dependencies, and evaluation status as core catalog fields.[^anthropic-enterprise]
Backstage demonstrates keeping catalog metadata near code while processors
derive operational views.[^backstage-catalog] Provenance should identify the
artifact, inputs, and producer so a reviewer can verify that the installed bytes
are the bytes assessed.[^slsa-provenance]

## Authority and freshness

- Authors may change authored claims but not approval fields.
- Reviewers approve an exact digest, scope, and effective policy, not a mutable
  name or `latest` pointer.
- Runtime facts are observations, not author declarations.
- Missing evidence remains missing; absence of an incident is not approval.
- Material identity, authority, dependency, owner, host, or model changes
  invalidate the affected decision and trigger re-evaluation or reapproval.

Recommended lifecycle states are `candidate`, `experimental`, `approved`,
`deprecated`, `revoked`, and `retired`. Publication and installation are
orthogonal deployment facts, not lifecycle approval states.

[^anthropic-enterprise]: Anthropic — Skills for enterprise
[^backstage-catalog]: Backstage Software Catalog
[^slsa-provenance]: SLSA provenance

