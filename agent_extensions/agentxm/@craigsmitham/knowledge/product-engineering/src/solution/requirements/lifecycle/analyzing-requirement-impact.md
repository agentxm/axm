---
type: Guide
title: Analyzing and specifying requirement change
description: Traces a proposed requirement change through sources, dependents, realization, verification, validation, and operations, then states the exact change put up for decision. Use when a requirement change is proposed and either its reach across dependents and existing evidence or its precise before and after meaning is not yet written down.
tags: [impact-analysis, requirement-change, before-after, traceability, evidence, dependency, pe-solution]
generated: { by: claude/opus-5, at: 2026-09-08T00:00:00Z }
---

# Analyzing and specifying requirement change

Impact analysis begins with the exact proposed semantic change and follows
typed relationships in both directions.

Consider:

- source needs, goals, rules, decisions, and stakeholder commitments;
- parent, refined, allocated, dependent, conflicting, and sibling requirements;
- terminology, models, interfaces, data, designs, code, configuration, and operations;
- assessments, fixtures, evidence, monitoring, and acceptance claims;
- delivery plans, migrations, releases, support, documentation, and training;
- external obligations, security, safety, privacy, accessibility, and other
  relevant qualities.

For each affected item, record why it may be affected, evidence inspected,
owner, proposed response, and remaining uncertainty. Search is discovery
evidence, not proof that no unlinked dependents exist.

Scale breadth to consequence and coupling. Report the declared search boundary
and inaccessible or missing sources.

## Specifying the change

A requirement change should identify more than edited prose. Record:

- the authoritative requirement identity and current revision;
- the exact before and proposed after meaning;
- why the change is needed and its source evidence;
- whether authority, normative force, subject, conditions, outcome, quantities,
  exceptions, classification, or relationships change;
- impact findings, conflicts, transition or migration needs, and compatibility;
- assessments and evidence that must be revised, rerun, retired, or preserved;
- decision authority, outcome, effective point, and rollback or supersession policy.

Do not infer authorization from the existence of a proposal or implementation.
If the changed meaning is materially different, consider a new requirement
identity linked by `supersedes` rather than overwriting historical meaning.
Where a work item coordinates the revision, [Composing with work
management](../adaptation/composing-with-work-management.md) owns that
relationship and leaves requirement meaning with the requirement source.
