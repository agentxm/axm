---
type: Reference
title: Specification authority
description: How spec-first, spec-anchored, and spec-as-source relationships assign truth and change flow.
tags: [specifications, source-of-truth, spec-first, spec-anchored, spec-as-source, authority]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T20:43:46Z }
stale_after: 2027-02-14
---

# Specification authority

“Spec-driven” does not identify which artifact remains authoritative or how
change flows. Determine the relationship from repository evidence before
treating a specification as current context.

| Model | Authority and change flow | Lifecycle |
| --- | --- | --- |
| Spec-first | A bounded specification guides implementation and then becomes historical evidence | New change starts a new or revised record |
| Spec-anchored | A maintained specification remains authoritative beside human-edited implementation | Intent and implementation changes reconcile both directions |
| Spec-as-source | A canonical specification generates implementation or contracts | Changes begin in the spec and flow through generation |
| No explicit model | Authority is distributed or unresolved | Surface ambiguity; do not invent policy |

## Evidence to inspect

- repository instructions and contributor guidance;
- generated-file markers and generator configuration;
- CI checks for drift between spec and implementation;
- change history showing which artifact changes first;
- ownership and review rules;
- active, historical, superseded, or generated lifecycle labels; and
- runtime evidence when documentation and implementation conflict.

## Context consequences

- A historical spec supplies rationale but should not override newer accepted
  implementation or task intent.
- A spec-anchored model requires visible reconciliation when code and intent
  differ.
- A generated artifact is observation of the canonical spec, not an editing
  surface.
- A test proves only the relation it checks; absence of drift checking is not
  evidence that a specification is non-authoritative.

Record unresolved authority as a decision. Do not make plausible prose the
source of truth merely because it is easier for an agent to read.
