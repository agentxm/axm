---
type: Guide
title: Analyzing and specifying requirement change
description: Traces a proposed requirement change through sources, dependents, realization, verification, validation, and operations, then states the exact change put up for decision. Use when a requirement change is proposed and either its reach across dependents and existing evidence or its precise before and after meaning is not yet written down.
tags: [impact-analysis, requirement-change, before-after, traceability, evidence, dependency, pe-solution]
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
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

When the proposed change affects project capability, cost, or timing,
[Alleman's performance-based project management](../../../foundations/alleman-performance-based-project-management.md)
connects revised scope and evidence to the plan and forecast. The requirement
analysis here states the changed obligation; a forecast does not authorize it.

## Continue exploring

- [Maintenance and the life of software products](../../../maintenance/maintenance-and-the-life-of-software-products.md)
  supplies the wider judgment about understanding and intervening in existing arrangements.
- [Keeping specifications authoritative](../../../engineering/keeping-specifications-authoritative.md)
  covers the continued authority and evidence of affected executable specifications.
- The [continuity and change route](../../../reading-product-engineering.md#continuity-and-change)
  places this requirement-specific analysis in its wider product context.

## Worked continuation

The [Northbank specimen](../authoring/northbank-commitment-requirements.md#a-later-change-reopens-the-scope)
changes a local asset replacement into proposed partner coordination. The reach
includes customer terms, provider outcomes, holds, state, persistence, tests,
telemetry, staff procedure, migration, and the forecast. The old concurrency
result remains attributable to the old scope rather than being silently reused
as proof of the expanded obligation.
