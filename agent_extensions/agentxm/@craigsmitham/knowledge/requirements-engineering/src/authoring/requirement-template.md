---
type: Template
title: Requirement template
description: Provides a compact Markdown fallback for requirements when native host fields cannot preserve the content contract.
tags: [template, requirement, markdown, fallback]
sources:
  - id: content-contract
    resource: requirement-content-contract.md
    title: Requirement content contract
generated: { by: codex/gpt-5.6, at: 2026-08-29T20:06:39Z }
---

# Requirement template

Use native repository or requirements-management fields when they preserve the
[content contract](requirement-content-contract.md). Otherwise adapt this
fallback; do not retain empty headings mechanically.[^content-contract]

```markdown
# <REQ-ID>: <short obligation-oriented title>

- Maturity: <candidate | normative | local state>
- Authority: <decision record, owner, or unresolved>
- Classification: <project category; optional portable mapping>
- Obligated subject: <system, service, role, process, or other subject>

## Requirement

<Under condition or trigger, the subject shall provide, maintain, or prevent
one bounded outcome. Include measurable limits and explicit exceptions.>

## Source and rationale

- Sources: <stable references, versions, observations>
- Rationale: <why the obligation is needed>
- Assumptions or open questions: <unknowns without invented certainty>

## Relationships

- Derived from / refines / conflicts with: <stable identifiers>
- Realized by / verified by / changed by: <typed references when known>

## Assessment

- Verification approach: <test, analysis, inspection, demonstration, other>
- Validation basis: <stakeholder, research, experiment, outcome evidence>
- Context and limits: <revision, environment, exclusions, evidence gaps>

## History

<decision and semantic change record, including superseded identities>
```

[^content-contract]: The cited content contract defines the semantics this
    fallback form must preserve.
