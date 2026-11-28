---
type: Guide
title: Analyzing and specifying requirement change
description: Traces a proposed requirement change through sources, dependents, realization, verification, validation, and operations, then states the exact change put up for decision. Use when a requirement change is proposed and either its reach across dependents and existing evidence or its precise before and after meaning is not yet written down.
tags: [impact-analysis, requirement-change, before-after, traceability, evidence, dependency, requirements-engineering]
generated: { by: codex/gpt-6, at: 2026-11-22T02:01:18Z }
---

# Analyzing and specifying requirement change

Open the current requirement at the revision the proposal would change.
Write down a case the proposal would treat differently. If nobody can tell
what would change, take the ambiguity back to the proposer and record it.
For a wording-only change, check that readers still reach the same decision
on the affected cases.

Trace the proposed change from that revision to the sources that justify it
and the people, artifacts, and decisions that depend on it. Consider:

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
- decision authority, proposed effective point, and rollback or supersession policy.

For example, suppose a partner asks to extend access to catalog exports
from seven days to fourteen. An eight-day-old export distinguishes the
obligations. Follow it through the download rule, the storage cleanup job,
and the test that expects the download to fail. Ask whether exports already
deleted at the transition are covered. If the proposal leaves that open,
name who can settle it.

Read the proposal as the decision maker. Can you tell which cases would
be decided differently, which evidence still applies, and which questions
remain? Keep the proposal pending until the authorized decision is known.
Record the outcome and effective point when decided.

If the proposal changes what the project can deliver, when, or at what cost,
identify the affected commitments and estimates for the people maintaining
the plan. Mark any forecast that depends on a pending decision.

## Optional companion readings

- For an example of connecting capability and evidence to a delivery forecast,
  see Glen Alleman's approach to performance-based project management at
  [Glen Alleman's performance-based project management: capabilities, credible plans, and evidence of progress](../../project-management/foundations/alleman-performance-based-project-management.md).
- If automated examples express or verify the changed rule, the *Executable
  specifications* pattern explains how to check their authority and evidence.
  See [Executable specifications](../../software-testing/patterns/executable-specifications.md).
