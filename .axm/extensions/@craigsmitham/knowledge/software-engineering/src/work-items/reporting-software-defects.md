---
type: Guide
title: Reporting software defects
description: How to write an evidence-rich defect work item that makes the expected behavior, observed discrepancy, context, impact, and verification conditions clear.
tags: [bug-report, expected-behavior, actual-behavior, reproduction, environment, severity, acceptance-criteria, issue-template]
status: draft
sources:
  - id: defect-explainer
    resource: software-defects-and-defect-reports.md
    title: Software defects and defect reports
  - id: istqb-foundation
    resource: https://www.istqb.org/wp-content/uploads/2024/11/ISTQB_CTFL_Syllabus_v4.0.1.pdf
    title: ISTQB Certified Tester Foundation Level Syllabus v4.0.1
  - id: github-issue-form
    resource: https://docs.github.com/en/enterprise-cloud@latest/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms
    title: GitHub Docs — Syntax for issue forms
generated:
  by: codex/gpt-5
  at: 2026-08-16T00:17:02Z
---

# Reporting software defects

Use this guide when observed behavior, a review, or a test indicates that a
software work product may violate an accepted expectation. It creates evidence
for triage and correction; it does not require the reporter to diagnose the
root cause. For the conceptual distinctions, read
[Software defects and defect reports](software-defects-and-defect-reports.md).

## Goal

Another person can understand the discrepancy, judge its impact, reproduce or
investigate it under the relevant conditions, and verify the chosen resolution
without first interviewing the reporter.

## 1. Establish the expectation

State what should happen and identify its authority when available: a
requirement, acceptance criterion, specification, documented contract,
previously accepted behavior, or domain rule.

If there is no accepted expectation and the request is to create new behavior,
write a [feature request](writing-feature-requests.md) instead. If the
expectation itself is disputed, preserve that uncertainty for triage.

## 2. Title the discrepancy

Use the affected behavior, observed result, and triggering condition:

> Invoice export omits zero-value lines when tax details are included

Avoid “Export is broken,” a presumed code location, or only the reporter’s
preferred fix. Add a one- or two-sentence summary so the item is legible
wherever it is scanned rather than opened; see
[Titling and summarizing work items](titling-and-summarizing-work-items.md).

## 3. Contrast actual and expected behavior

Describe the smallest observable difference. Keep the two results separate so
reviewers can challenge either the evidence or the expectation. ISTQB and
common tracker templates treat expected and actual results as core defect
information.[^istqb-foundation][^github-issue-form]

## 4. Provide reproduction or occurrence evidence

Give the shortest reliable route to the discrepancy:

1. starting state and relevant data;
2. actions or event sequence;
3. exact observation point; and
4. frequency or known intermittency.

When deterministic reproduction is unavailable, provide timestamps,
correlation identifiers, affected records, logs, screenshots, recordings, or
a minimal example. “Not yet reproducible” is a state of knowledge, not a reason
to discard a well-evidenced occurrence.

## 5. Bound the context and impact

Record only environment details that can change interpretation: version,
build, platform, configuration, permissions, locale, data shape, integration,
or deployment region. State who or what is affected and how. Assign severity
from the local scale using that evidence; keep scheduling priority separate.

## 6. Separate facts, hypotheses, and investigation

Label suspected causes and attempted diagnostics. Record eliminated conditions
so another investigator does not repeat them, but do not rewrite the title or
actual behavior around an unconfirmed theory.

## 7. Define verification conditions

State what evidence will demonstrate that the discrepancy is resolved. Include
the original failing case and important adjacent or regression cases. Do not
make one proposed implementation the acceptance condition unless that
mechanism is itself an authoritative constraint.

## Tracker-ready template

```markdown
# <Affected behavior> <actual result> when <condition>

## Summary

One or two sentences: what is wrong now and why it matters.

## Expected behavior

What should happen? Link the authoritative expectation when available.

## Actual behavior

What was observed instead?

## Reproduction or occurrence evidence

1. Starting state:
2. Actions or event sequence:
3. Observation:
4. Frequency:

## Context

- Version or build:
- Environment and configuration:
- Relevant data or permissions:

## Impact

Who or what is affected, how, and to what extent?

## Evidence and investigation

Logs, screenshots, minimal example, timestamps, hypotheses, and eliminated conditions.

## Verification conditions

What observable evidence will confirm the chosen resolution?
```

## Final check

- The title and summary alone say what is wrong and why it matters.
- The expected behavior has a stated basis.
- Actual behavior is observable rather than inferred.
- Reproduction or occurrence evidence preserves the relevant context.
- Impact supports severity; severity is not used as priority.
- Suspected causes remain distinguishable from facts.
- Verification conditions test the behavior, not merely the implementation.

[^github-issue-form]: GitHub Docs, “Syntax for issue forms,” bug-report example.
[^istqb-foundation]: ISTQB Certified Tester Foundation Level Syllabus v4.0.1, defect-report contents.
