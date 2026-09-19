---
type: Reference
title: Portfolio coherence and observability
description: How event-driven and periodic controls keep a large catalog owned, distinct, useful, current, and safely exposed.
tags: [agent-skills, portfolio, coherence, observability, catalog, curation]
status: stable
stale_after: 2027-02-14
generated: { by: "codex/gpt-5.6", at: 2026-08-14T19:57:04Z }
sources:
  - id: anthropic-enterprise
    resource: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/enterprise
    title: Anthropic — Skills for enterprise
  - id: dynamic-agent-skills
    resource: https://arxiv.org/abs/2607.10113
    title: Dynamic Agent Skills — A Lifecycle Survey and Taxonomy of Evolving Skill Libraries
  - id: backstage-entity-lifecycle
    resource: https://backstage.io/docs/features/software-catalog/life-of-an-entity/
    title: Backstage — The life of an entity
---

# Portfolio coherence and observability

The full catalog is an inventory; an active cohort is the bounded set exposed
to one agent, role, environment, or task family. Do not place a large catalog's
complete metadata into every context. Measure selection as cohorts grow and use
routing, role bundles, or explicit activation to keep exposure focused.
Anthropic warns that skill metadata competes for attention and recommends
coexistence evaluation and role-focused bundles.[^anthropic-enterprise]

## Control loops

Run event-driven checks for proposals, revisions, dependency changes, owner
changes, releases, policy changes, and incidents. Run periodic checks for drift
that no change event reveals.

Automate:

- schema, license, secret, provenance, integrity, and dependency checks;
- ownership resolution, evidence freshness, lifecycle and changelog consistency;
- capability and risk deltas, permission outliers, and policy mismatches;
- description similarity, route collisions, broken relations, and version skew;
- isolated, neighboring-skill, active-cohort, and previous-version evaluations;
- deprecated versions still active, orphaned skills, and unused candidates.

Humans decide whether observed similarity is duplicate responsibility, whether
skills should split or consolidate, whether low use means low value, whether an
exception is justified, and when migration or retirement is acceptable.

## Health view

Report separate measures rather than one score:

| Dimension | Representative signals |
| --- | --- |
| Stewardship | Owned, orphaned, overdue review, unresolved escalation |
| Evidence | Evaluation and audit coverage, freshness, unsupported claims |
| Coherence | Misses, false positives, collisions, ambiguous routes, bundle recall |
| Risk | Capability outliers, exceptions, policy mismatch, incidents |
| Lifecycle | Version skew, deprecated active, migration overdue, revocation propagation |
| Utility | Qualified use, outcome support, marginal value over baseline, repeated failure |

Use semantic neighborhoods and active cohorts to prioritize coexistence tests
rather than treating every possible pair as equally relevant. Current lifecycle
research reports that flat retrieval degrades as libraries grow and maintenance
becomes load-bearing.[^dynamic-agent-skills]

Keep authoritative metadata near source and let catalog processors derive
search, relationships, policy findings, and orphan status continuously.[^backstage-entity-lifecycle]
Catalog observations inform decisions; they do not silently rewrite source or
approve a package.

[^anthropic-enterprise]: Anthropic — Skills for enterprise
[^dynamic-agent-skills]: Dynamic Agent Skills — A Lifecycle Survey and Taxonomy of Evolving Skill Libraries
[^backstage-entity-lifecycle]: Backstage — The life of an entity

