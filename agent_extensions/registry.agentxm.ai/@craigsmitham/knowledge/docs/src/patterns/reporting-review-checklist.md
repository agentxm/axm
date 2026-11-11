---
type: Pattern
title: Reporting and review checklist
description: When a report or review can omit important topics, map explicit coverage criteria to located evidence, findings, and justified exclusions without treating completeness as proof of quality.
tags: [docs, documentation-pattern, checklist, reporting-review, reporting, inspection, review, traceability, authoring]
status: draft
sources:
- id: checklist-design-origin
  resource: https://github.com/craigsmitham/agent-extensions/blob/156c3d4346bee6874ab3d356c19446cf6425713b/skills/checklist-design/src/references/validation-and-lifecycle.md
  title: Craig Smitham — Validation and lifecycle, version 0.1.10
- id: prisma
  resource: https://www.prisma-statement.org/prisma-2020
  title: PRISMA — PRISMA 2020 statement and reporting checklists
- id: inspection-comparison
  resource: https://publica.fraunhofer.de/entities/publication/eb2a71d4-2bfc-43c8-a5bf-8a03f643c016
  title: Perspective-based versus checklist-based software inspection
generated:
  by: codex/gpt-6
  at: '2026-11-11T17:40:43Z'
---

# Reporting and review checklist

When a report or review can omit important topics, **map explicit coverage
criteria to located evidence, findings, and justified exclusions without
treating completeness as proof of quality**.

## Problem and design response

Authors can omit information readers need; reviewers can overlook a relevant
question. A coverage checklist makes the topics explicit and records what was
found. Reporting and inspection are related applications of that response, but
their claims differ: reporting can establish that information is present;
inspection can identify a discrepancy that still needs adjudication.

PRISMA publishes reporting checklists with expanded recommendations and a
separate explanation-and-elaboration paper. This illustrates concise coverage
prompts backed by fuller guidance.[^prisma] It does not establish that a
complete report has sound methods or correct conclusions.

## How to write it

1. Name the artifact, scope, version, audience, and reporting or inspection job.
2. Select criteria from the relevant authority and failure evidence. Make clear
   whether an item asks for presence, traceability, or a substantive finding.
3. Provide a place for the evidence location, result, and reason for an exclusion
   or non-applicable item. An empty field must not silently mean “reviewed.”
4. For findings, separate observation, interpretation, materiality, and follow-up.
   Identify who resolves disagreements or accepts a disposition.
5. Preserve the reviewer’s place and outstanding questions across interruptions
   or multiple sessions. Keep evidence tied to the reviewed revision.

Use [Checklist](checklist.md) for item wording, source authority, accessibility,
and lifecycle. For a corpus audit, pair the aid with the scope and coverage
method in [Documentation audit report contract](../guides/auditing-documentation.md).

## Applicability and tradeoffs

Use this pattern when explicit topics can improve coverage or consistency.
Use [Verification checklist](verification-checklist.md) when checking known
resulting states is the primary job. Use a rubric and expert judgment for
qualitative assessment; use a form when data capture is the main need.

Shared prompts make coverage comparable but can anchor reviewers on the listed
topics and hide unanticipated concerns. Broad lists generate irrelevant work;
narrow lists invite mistaken claims of completeness. A reporting aid may help
an author explain what happened while providing little evidence that it was
done well. Leave room for consequential observations outside the list.

## Illustrative realizations

A release report might locate the change description, validation evidence,
known limitations, and responsible owner. A code-review aid might prompt the
reviewer to inspect error paths and record a concrete defect or the evidence
supporting no finding. One emphasizes reporting coverage; the other seeks
material findings. They need different acceptance criteria.

These are synthetic examples. A checklist claiming to prove overall design
excellence from the presence of sections exceeds this pattern's evidence.

## Review and evidence

For reporting, examine missing information and traceability. For inspection,
adjudicate valid, material findings, missed issues, false positives, agreement,
and review effort. When comparing review methods, examine overlap and unique
findings as well as totals; more raw findings can mean duplicated or invalid
reports. The earlier guidance cites research comparing perspective-based and
checklist-based inspection as a domain-specific comparator, not proof that
one method is universally superior.[^inspection-comparison]

This draft migrates that claim-specific evaluation guidance.[^checklist-design-origin]
Successful coverage is one result; artifact quality and downstream outcomes
require their own evidence.

[^checklist-design-origin]: Craig Smitham — Validation and lifecycle, version 0.1.10.
[^prisma]: PRISMA — PRISMA 2020 statement and reporting checklists.
[^inspection-comparison]: Perspective-based versus checklist-based software inspection.
