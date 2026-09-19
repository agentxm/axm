---
type: Explainer
title: Documentation audits
description: What a documentation audit is — a bounded, evidence-backed assessment of a documentation corpus that distinguishes diagnosis from review, linting, verification, and remediation.
tags: [docs, audit, assessment, quality, evidence, coverage, findings, remediation]
status: stable
sources:
  - id: documentation-quality
    resource: documentation-quality.md
    title: Documentation quality
  - id: documentation-organization
    resource: documentation-organization-and-discovery.md
    title: Documentation organization and discovery
  - id: documentation-workflow
    resource: ../guides/documentation-workflow.md
    title: Documentation workflow guide
generated:
  by: codex/gpt-5.6
  at: 2026-08-15T17:08:26Z
---

# Documentation audits

A **documentation audit** is a bounded, snapshot-specific assessment of a
documentation corpus. It gathers evidence about how well the corpus serves its
readers and maintainers, identifies material gaps or defects, and produces a
prioritized diagnostic handoff. It does not silently become a rewrite.

An audit is useful before a substantial remediation effort, when a collection's
health is uncertain, or when recurring failures suggest that reviewing one page
at a time will miss a systemic problem.

## Boundaries

| Activity | Primary question | Typical output |
| --- | --- | --- |
| Audit | What is true of this bounded corpus, and what deserves attention? | Evidence-backed findings and remediation order |
| Document review | How well does this identified document serve its job? | Focused feedback or edits |
| Lint or link check | Does the corpus satisfy deterministic rules? | Machine findings |
| Verification | Does a claim or completed change agree with its authority? | Pass, fail, or unresolved evidence |
| Remediation | What should be changed now? | Revised documents, paths, or metadata |

These activities can compose, but they should not be conflated. Lint results
are evidence in an audit, not proof that documentation is accurate or useful.
An audit can recommend remediation without having authority to perform it.

## Audit dimensions

Select dimensions that answer the audit question rather than applying every
possible checklist indiscriminately.

- **Discovery and organization** — Can readers find the right material through
  browsing, search, links, filenames, titles, and metadata?
- **Reader-job and form fit** — Is each document's primary job recognizable,
  and does its form support that job?
- **Accuracy and functional completeness** — Do claims agree with current
  authoritative behavior, and is enough present for the stated job?
- **Conceptual clarity and coherence** — Are important distinctions explained,
  related concepts connected, and terms used consistently?
- **Authority and provenance** — Can a maintainer tell what source governs a
  claim and where uncertainty remains?
- **Freshness, ownership, and lifecycle** — Are review triggers, stale material,
  deprecations, and maintenance responsibility visible enough for the host?
- **Duplication and consistency** — Are several pages independently asserting
  facts that should have one authority?
- **Reader-journey coverage** — Can representative readers complete important
  learning, work, lookup, and understanding journeys?
- **Maintainability and validation** — Can changes be checked, indexed, linked,
  and kept coherent with reasonable effort?

The dimensions join functional and deep quality. Accuracy, completeness, and
consistency are checkable against the world; form fit, flow, and anticipation
require judgment about people using the documentation.[^documentation-quality]

## Evidence and coverage

An audit claim is only as strong as its evidence and declared coverage.

Possible coverage strategies include:

- a **census** of paths and metadata across the bounded corpus;
- a **full content review** when the corpus is small enough; or
- a **purposeful sample** chosen across important subjects, forms, lifecycle
  states, owners, and reader journeys.

Sampling is legitimate when its limits are explicit. “Three current API
references and two onboarding guides were reviewed” supports a narrower claim
than “all product documentation was audited.” A clean sample should not be
generalized beyond the population it represents.

Useful evidence includes source files, rendered navigation, search results,
local instructions, authoritative code or interfaces, release history,
analytics, support questions, validator output, and observed reader journeys.
Absence can also be evidence, but only relative to a demonstrated reader need
or documentation obligation. A collection does not have a gap merely because
one Diátaxis form or taxonomy category is absent.

## Findings are arguments

A useful finding connects:

1. a condition observed in the audited scope;
2. the evidence that supports it;
3. its impact on a reader, maintainer, or obligation;
4. the expected state or quality criterion; and
5. a proportionate next route.

Severity and confidence answer different questions. **Severity** estimates the
consequence of leaving the condition unchanged. **Confidence** reflects the
strength and coverage of the evidence. A potentially severe issue supported by
limited evidence should be reported as severe but low-confidence, not averaged
into a vague score.

Prefer explicit findings and an overall disposition over a single numeric
health score. Scores conceal weighting choices and can make unlike qualities
look commensurable.

## What an audit must preserve

An audit should name strengths as well as defects. Existing structures that
work are constraints on safe remediation, not filler for a balanced report.
It should also preserve uncertainty: distinguish material that is wrong,
inconsistent, stale, unverifiable, or merely unconventional.

The audit stops at diagnosis unless remediation was separately requested. If
the request includes both, complete the diagnostic first so the changes remain
traceable to evidence, then use the smallest appropriate authoring workflow.

## Related

- [Auditing documentation](../guides/auditing-documentation.md)
- [Documentation quality](documentation-quality.md)
- [Documentation organization and discovery](documentation-organization-and-discovery.md)
- [Documentation craft](documentation-craft.md)
- [Documentation workflow guide](../guides/documentation-workflow.md)

[^documentation-quality]: Documentation quality distinguishes objective,
    independently checkable functional qualities from interdependent qualities
    of human fit and flow.
