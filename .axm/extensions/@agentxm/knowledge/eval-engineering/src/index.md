---
okf_version: "0.2"
---

# Evaluation engineering

Portable measurement practice for evaluating prompts, context systems, agents,
harnesses, skills, models, and complete AI applications. Use it to design an
evaluation that supports a named decision; use the target discipline to define
the behavior and risks that matter for that target.

## Foundations

- [Evaluation engineering](foundations/evaluation-engineering.md) - Defines evaluation engineering as a cross-cutting assurance discipline tied to decisions and deployment context.
- [Evaluation boundaries](foundations/evaluation-boundaries.md) - Distinguishes evaluations from tests, verification, benchmarks, red teaming, monitoring, experiments, and audits.
- [Evaluation systems and harnesses](foundations/evaluation-systems-and-harnesses.md) - Separates the target, operational agent harness, evaluation harness, environment, evidence, and decision.

## Design

- [Evaluation contracts](design/evaluation-contracts.md) - Names the identities, assumptions, evidence, analysis, and decision fields required for an attributable evaluation.
- [Task distributions and case suites](design/task-distributions-and-case-suites.md) - Turns intended use, real failures, edges, and adversarial conditions into representative and balanced cases.
- [Trials, variance, and uncertainty](design/trials-variance-and-uncertainty.md) - Designs repeated trials and reports distributions and uncertainty without treating one run as stable behavior.
- [Graders, rubrics, and metrics](design/graders-rubrics-and-metrics.md) - Chooses, calibrates, and combines deterministic, model-based, and human judgment instruments.
- [Outcomes, trajectories, and state](design/outcomes-trajectories-and-state.md) - Selects evidence from final results, external state, and execution traces without overconstraining valid paths.
- [Baselines, thresholds, aggregation, and slices](design/baselines-thresholds-aggregation-and-slices.md) - Makes comparisons and dispositions without allowing aggregate scores to hide critical failures.

## Validity and trust

- [Evaluation validity and threats](trust/evaluation-validity-and-threats.md) - Addresses construct validity, deployment fidelity, leakage, bias, gaming, evaluator failures, and independent review.

## Operations

- [Eval-driven development](operations/eval-driven-development.md) - Uses evaluations before and throughout development to define success, compare attributable changes, and retain regressions.
- [Capability and regression suites](operations/capability-and-regression-suites.md) - Separates hill-climbing evidence from reliable-behavior protection and manages graduation and saturation.
- [Production evaluation and drift](operations/production-evaluation-and-drift.md) - Connects offline evaluation with monitoring, feedback, experiments, incidents, and changing deployment conditions.
- [Evaluation lifecycle and governance](operations/evaluation-lifecycle-and-governance.md) - Treats suites and graders as versioned products with owners, provenance, review, freshness, and retirement.

## Reference

- [Evaluation engineering glossary](evaluation-engineering-glossary.md) - Defines the bundle's core terms and disambiguates overloaded evaluation language.

## Compatibility

- [Evaluation engineering glossary (former route)](glossary.md) - Deprecated route retained for callers that used the original concept ID.
