---
type: Reference
title: Evaluation validity and threats
description: Addresses construct validity, deployment fidelity, leakage, bias, gaming, evaluator failures, and independent review.
tags: [construct-validity, leakage, contamination, bias, gaming, independence, metaevaluation]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T21:14:15Z }
stale_after: 2027-02-14
sources:
  - id: nist-rmf
    resource: https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
    title: NIST — AI RMF Core
  - id: anthropic-evals
    resource: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    title: Anthropic — Demystifying evals for AI agents
---

# Evaluation validity and threats

| Threat                      | Control                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| Wrong construct             | Trace every metric and grader to the decision and real success condition.                              |
| Unrepresentative cases      | Sample from deployment conditions and document missing populations.                                    |
| Leakage or contamination    | Separate development and held-out cases; restrict hidden fixtures and graders.                         |
| Environment mismatch        | Match production tools, authority, state, limits, and failure conditions closely enough for the claim. |
| Correlated trials           | Reset state and identify shared infrastructure or simulator dependencies.                              |
| Grader bias or drift        | Calibrate, version, slice, inspect disagreement, and rerun stable calibration cases.                   |
| Ambiguous or broken tasks   | Require fair specifications, known solutions, and transcript review.                                   |
| Gaming and Goodhart effects | Keep critical measures plural, inspect surprising wins, and harden graders against bypasses.           |
| Evaluator conflict          | Use independent review proportional to consequence and separate author claims from approval.           |
| Saturation                  | Move solved capability cases into regressions and introduce harder representative work.                |

NIST calls for construct validation, representative data, measurement under
deployment-like conditions, independent assessors, and evaluation of the TEVV
process itself.[^nist-rmf] Anthropic recommends reading traces because apparent
target failures often come from tasks, graders, environments, or harness
constraints.[^anthropic-evals]

Evaluate the evaluation: can known good and bad examples produce fair grades,
can qualified reviewers reproduce the disposition, and would changing an
irrelevant surface change the result?

[^nist-rmf]: NIST — AI RMF Core

[^anthropic-evals]: Anthropic — Demystifying evals for AI agents
