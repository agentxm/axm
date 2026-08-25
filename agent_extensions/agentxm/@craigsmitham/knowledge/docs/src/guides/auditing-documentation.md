---
type: Guide
title: Auditing documentation
description: How to scope, inspect, sample, assess, and report on a documentation corpus without conflating diagnosis with remediation.
tags: [docs, audit, assessment, inventory, sampling, evidence, findings, quality]
status: stable
sources:
  - id: documentation-audits
    resource: ../explainers/documentation-audits.md
    title: Documentation audits
  - id: documentation-quality
    resource: ../explainers/documentation-quality.md
    title: Documentation quality
  - id: documentation-organization
    resource: ../explainers/documentation-organization-and-discovery.md
    title: Documentation organization and discovery
generated:
  by: codex/gpt-5.6
  at: 2026-08-15T17:08:26Z
---

# Auditing documentation

Use this guide to assess a bounded documentation corpus before deciding or
performing remediation. For the boundaries and reasoning behind the activity,
read [Documentation audits](../explainers/documentation-audits.md).

## Goal

Produce a snapshot-bound, evidence-backed account of the corpus's strengths,
material problems, limitations, and recommended remediation order. Do not edit
the audited documentation unless the request separately authorizes remediation.

## 1. State the question, scope, and snapshot

Record:

- the decision or concern the audit should inform;
- included and excluded paths, products, versions, or audiences;
- the repository revision, release, or observation time;
- applicable local instructions and authoritative sources; and
- known constraints on access, rendering, analytics, or domain verification.

If the request says only “audit the docs,” infer the narrowest useful corpus
from the supplied context and state that interpretation. Ask for direction only
when competing scopes would materially change the work.

## 2. Select relevant dimensions

Choose from discovery, form fit, accuracy, completeness, conceptual coherence,
authority, freshness, lifecycle, duplication, reader-journey coverage, and
maintainability. Define what evidence would support each selected dimension.

Do not turn the list into a mandatory scorecard. Omit dimensions that do not
answer the audit question, and name the omission when a reader might otherwise
assume it was assessed.

## 3. Inventory before judging

Map the corpus sufficiently to understand:

- documents, indexes, generated views, and navigation surfaces;
- titles, filenames, types, subjects, owners, and lifecycle signals;
- links, dependencies, duplicate claims, and apparent authorities; and
- the important reader journeys the collection promises to support.

Use deterministic inventory, link, metadata, or schema checks already present
in the host. Do not install tools or mutate files merely to complete an audit.

## 4. Declare coverage

Choose and report one or more strategies:

- **Path census** — inspect all paths and machine-readable metadata.
- **Full bounded review** — read all substantive content in a small scope.
- **Purposeful sample** — select representative documents across material
  subjects, forms, audiences, owners, ages, and lifecycle states.
- **Journey sample** — follow important tasks from entry point to completion.

Record the population, selection method, reviewed items, and material blind
spots. Do not use sample findings to claim corpus-wide prevalence without
support.

## 5. Inspect reader journeys and content

For each representative journey or document, ask:

1. Can the intended reader find and recognize it?
2. Is its primary job clear and does its form sustain that job?
3. Are its claims correct and complete enough for that job?
4. Are authority, preconditions, limits, and failure conditions visible?
5. Does it connect to the next information the reader needs?
6. Can a maintainer tell when and how it should change?

Test claims against authoritative behavior where the scope permits. Separate
“not verified” from “incorrect.” Treat local conventions as evidence of host
fit, not universal documentation law.

## 6. Form findings

Give each material finding:

- **ID and title**
- **Severity** — consequence if left unchanged
- **Confidence** — strength and coverage of evidence
- **Condition** — what was observed
- **Evidence** — paths, lines, commands, observations, or sources
- **Impact** — affected reader, maintainer, or obligation
- **Expected state** — the applicable criterion or desired condition
- **Recommendation** — a proportionate next action
- **Route** — authoring, organization, domain verification, tooling, or owner

Group repeated instances when one underlying condition explains them. Keep
separate findings when causes, owners, or remediation differ.

Use plain severity labels whose meanings are stated in the report. A useful
default is:

| Severity | Meaning |
| --- | --- |
| Critical | Likely to cause serious harm, unsafe action, or broad inability to use the documented system |
| High | Blocks an important reader journey or materially misstates authoritative behavior |
| Medium | Creates recurring confusion, inconsistency, or maintenance cost without broadly blocking use |
| Low | Localized friction or a bounded quality defect with a straightforward workaround |

## 7. Report in decision order

Present the audit as:

1. **Scope and snapshot**
2. **Overall disposition**
3. **Coverage and method**
4. **Strengths to preserve**
5. **Findings**, ordered by severity and then remediation dependency
6. **Recommended remediation order**
7. **Limitations and unresolved evidence**
8. **Handoff**

Use one of these dispositions when useful: **sound within audited scope**,
**targeted remediation**, **structural remediation**, or **insufficient
evidence**. It summarizes the findings; it does not replace them.

## 8. Stop at the authority boundary

Return the report without changing the corpus for an audit-only request. For an
“audit and fix” request, preserve the report or an equivalent finding set, then
route accepted findings through the relevant authoring, organization, or
verification workflow. Ask before a fix expands scope, changes information
architecture materially, or requires product decisions the documentation
cannot establish.

## Final check

- The scope and snapshot are reproducible.
- Every broad claim is supported by declared coverage.
- Deterministic checks are distinguished from human judgment.
- Functional quality and reader fit were not collapsed into one score.
- Findings distinguish severity from confidence.
- Strengths, limitations, and unresolved evidence are visible.
- Recommendations are traceable to findings and routed to an owner or workflow.
- No remediation was performed without authority.

## Related

- [Documentation audits](../explainers/documentation-audits.md)
- [Documentation quality](../explainers/documentation-quality.md)
- [Documentation organization and discovery](../explainers/documentation-organization-and-discovery.md)
- [Organizing and naming documentation](organizing-and-naming-documentation.md)
- [Documentation workflow guide](documentation-workflow.md)
