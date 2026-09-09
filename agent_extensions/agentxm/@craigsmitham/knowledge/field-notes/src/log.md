# Field notes bundle update log

## 2026-09-08

* **Coherence**: Corrected [Subjects](subject-explainer.md) so survey mode no
  longer claims that notes under it are exempt from promotion. Survey and
  target subjects share the recurrence threshold described in
  [Closure](closure-explainer.md); what distinguishes a survey subject is that
  its characteristic output is a target condition.

## 2026-08-24

* **Evidence**: Added a safe diagnostic-envelope boundary so structured error,
  request, response, retry, recovery, and artifact identifiers survive until
  capture without retaining secrets or rerunning mutations. Distinguished
  fields not supplied by an authority from fields discarded by the observing
  workflow.

## 2026-08-15

* **Update**: Added unique occurrence and session identity; separated observed
  factors from causal hypothesis; captured detection, recovery, impact, and
  cost; introduced evidence-led, no-score priority assessment; and added
  decision ownership, action type, verification windows, and adverse-effect
  checks while preserving recurrence as the promotion threshold.

## 2026-08-08

* **Creation**: Established the bundle with [Field notes](field-notes-explainer.md),
  [Subjects](subject-explainer.md), and [Closure](closure-explainer.md).
  Concepts are `status: draft` pending human review.
