# Evaluation

Evidence systems that measure a named target on a relevant task distribution in
support of a decision.

## Foundations

- [Evaluation engineering](evaluation-engineering.md) - Evaluation as a
  cross-cutting assurance discipline tied to decisions and deployment context.
- [Evaluation boundaries](evaluation-boundaries.md) - Evaluations distinguished
  from tests, verification, benchmarks, red teaming, monitoring, experiments,
  and audits.
- [Evaluation systems and harnesses](evaluation-systems-and-harnesses.md) - The
  target, operational agent harness, evaluation harness, environment, evidence,
  and decision.

## Design

- [Evaluation contracts](evaluation-contracts.md) - The identities,
  assumptions, evidence, analysis, and decision fields an attributable
  evaluation requires.
- [How to build a task distribution and case suite](task-distributions-and-case-suites.md) -
  Turning intended use, real failures, edges, and adversarial conditions into
  representative cases.
- [Outcomes, trajectories, and state](outcomes-trajectories-and-state.md) -
  Selecting evidence from final results, external state, and execution traces
  without overconstraining valid paths.
- [Graders, rubrics, and metrics](graders-rubrics-and-metrics.md) - Choosing,
  calibrating, and combining deterministic, model-based, and human judgment.
- [Trials, variance, and uncertainty](trials-variance-and-uncertainty.md) -
  Repeated trials and reported distributions, rather than treating one run as
  stable behavior.
- [Baselines, thresholds, aggregation, and slices](baselines-thresholds-aggregation-and-slices.md) -
  Comparisons and dispositions that do not let aggregate scores hide critical
  failures.

## What each surface owes

- [Agent-specific evaluation](agent-specific-evaluation.md) - The scenarios,
  behaviors, trajectories, and risks an agent design must supply.
- [How to evaluate a context system](context-evaluation.md) - Selection,
  destination, authority, freshness, use, and economy evidence.
- [How to practice eval-driven prompt development](eval-driven-prompt-development.md) -
  Rendered prompt identity, controlled ablations, and response-contract
  evidence.
- [How to evaluate and improve a harness](evaluating-and-improving-harnesses.md) -
  Runtime identity, trace capture, environment fidelity, and responsible-surface
  attribution.
- [Agent Skill evaluation model](skill-evaluation-model.md) - Independent
  routing, activated execution, and coexistence evidence.
- [Routing evaluations](skill-routing-evaluations.md) - Cases and metrics for
  implicit selection, rejection, ambiguity, and catalog collisions.
- [Execution evaluations](skill-execution-evaluations.md) - Cases and evidence
  for instructions, resources, outcomes, recovery, and authority after
  activation.
- [Skill comparison surfaces](skill-comparison-surfaces.md) - Revisions,
  ablations, hosts, catalogs, and active cohorts as attributable comparison
  surfaces.

## Operate

- [How to practice eval-driven development](eval-driven-development.md) - Using
  evaluations to define success, compare attributable changes, and retain
  regressions.
- [Capability and regression suites](capability-and-regression-suites.md) -
  Separating hill-climbing evidence from reliable-behavior protection.
- [How to evaluate production behavior and detect drift](production-evaluation-and-drift.md) -
  Connecting offline evaluation with monitoring, feedback, experiments, and
  incidents.
- [Evaluation validity and threats](evaluation-validity-and-threats.md) -
  Construct validity, deployment fidelity, leakage, bias, gaming, evaluator
  failures, and independent review.
- [Evaluation lifecycle and governance](evaluation-lifecycle-and-governance.md) -
  Suites and graders as versioned products with owners, provenance, review,
  freshness, and retirement.
