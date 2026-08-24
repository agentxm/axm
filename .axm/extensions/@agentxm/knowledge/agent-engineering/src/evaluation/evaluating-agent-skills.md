---
type: How-to guide
title: How to evaluate an Agent Skill
description: How to evaluate routing and activated execution independently, compare a skill with meaningful baselines, run isolated trials, grade observable behavior, and retain attributable evidence.
tags: [agent-skills, evaluation, routing, execution, baselines, trials, graders, evidence]
status: stable
generated: { by: "claude-code/claude-opus-5", at: 2026-08-22T14:21:16Z }
stale_after: 2027-02-22
sources:
  - id: anthropic-agent-evals
    resource: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    title: Anthropic — Demystifying evals for AI agents
  - id: anthropic-skill-best-practices
    resource: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
    title: Anthropic — Skill authoring best practices
  - id: anthropic-skill-creator
    resource: https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md
    title: Anthropic — Skill Creator
  - id: openai-evaluation-best-practices
    resource: https://developers.openai.com/api/docs/guides/evaluation-best-practices
    title: OpenAI — Evaluation best practices
---

# How to evaluate an Agent Skill

Use this guide to produce behavioral evidence for one exact Agent Skill under a
named host, model, configuration, catalog, and authority policy. It specializes
the [Agent Skill evaluation model](skill-evaluation-model.md). Store source and
generated evidence according to
[How to manage evaluation assets and evidence](managing-evaluation-assets-and-evidence.md).
Use [Evaluation runner engineering](evaluation-runner-engineering.md) when a
shared runner or adapter executes the suite.

Evaluation measures behavior. It does not author the target, independently
audit its conformity or trust, approve it, or publish it. Keep those decisions
and authorities separate even when one delivery workflow invokes several of
them.

## Goal

Decide whether representative evidence supports the skill's routing and
activated-execution claims for the stated environment and intended use.

## Preconditions

- An exact target revision or content identity
- A named decision and intended task distribution
- A recorded host, model, configuration, active skill catalog, and authority
  policy
- Safe synthetic or appropriately governed cases and fixtures
- An evaluation harness able to isolate attempts and preserve evidence

Evaluate on every model class the supported claim names; model-specific skill
behavior should not be generalized from one convenient runner.[^anthropic-skill-best-practices]

## 1. Define the evaluation contract

Record the fields in [Evaluation contracts](evaluation-contracts.md), including
the target, scope, unit, cases, environment, evidence, graders, trial count,
baseline, analysis, provenance, and decision. State unsupported hosts, models,
catalogs, or cohorts as exclusions rather than generalizing from an available
environment.

Resolve one runner according to
[Evaluation runner engineering](evaluation-runner-engineering.md): an explicit
binding takes precedence, otherwise use an active configured default, otherwise
reserve preflight and conclude `Inconclusive` without creating run evidence.
Record the selection source and exact runner, protocol or evidence mapping,
capability, trust, and authority identities. Do not infer activation or trust
from retained files or auto-discover an executable.

Choose the evidence tier before running:

| Tier            | Purpose                                                          | Claim ceiling                                          |
| --------------- | ---------------------------------------------------------------- | ------------------------------------------------------ |
| Authoring smoke | Catch obvious structural or workflow defects during revision     | Same-agent development evidence only                   |
| Regression      | Protect previously accepted behavior in a controlled environment | Bounded reliability for tested cases and configuration |
| Release         | Inform release or promotion for a declared cohort                | The contract's tested scope, never universal approval  |

Do not upgrade a smoke result by changing its label after the run.

## 2. Build two independent stages

### Routing

Expose only the discovery surface available before activation, normally the
name and description. Do not reveal the skill body, expected selection, fixture,
or answer before recording the selected skill or abstention.

For each important trigger family include:

- a clear positive;
- a natural paraphrase;
- an adjacent negative with shared vocabulary;
- an ambiguous request where clarification or abstention is correct;
- a collision with plausible catalog neighbors; and
- an explicit invocation as a control, not as implicit-routing evidence.

Sample each case several times and record the trigger rate. Selection is a model
judgment that varies between attempts, so one attempt cannot characterize it.
Size cases so that consulting the skill is a plausible benefit; a request the
assistant satisfies unaided measures task difficulty rather than routing. When a
description is revised against these results, hold out decision cases first.
Record whether the harness observes native host routing, uses a host simulation,
or runs a catalog-classification proxy. Do not generalize proxy results into a
claim about native host activation.

Use [Routing evaluations](skill-routing-evaluations.md) for metrics and
interpretation.

### Activated execution

Activate the target explicitly so routing cannot hide an execution defect. Give
the trial only declared inputs and task-local fixtures. Cover the happy path, an
important edge, malformed or missing input, a resource or tool failure, and a
request beyond the skill's authority. Use
[Execution evaluations](skill-execution-evaluations.md) for the evidence
questions.

## 3. Choose a meaningful comparison

For a new skill, compare `with_skill` against the same target system without
the skill when that represents a real alternative. For a revision, compare the
candidate against the previous accepted exact revision. Keep task, harness,
environment, budgets, graders, and analysis fixed unless the decision explicitly
compares optimized systems.

Record `no-baseline` when no defensible comparison exists. Do not infer skill
value from an absolute pass alone. Use
[Skill comparison surfaces](skill-comparison-surfaces.md) and
[Baselines, thresholds, aggregation, and slices](baselines-thresholds-aggregation-and-slices.md)
to bound the claim.

## 4. Prove that cases and graders work

Make each case unambiguous enough that qualified reviewers can independently
apply its success criteria. Check at least one known pass, known failure, and
unknown or unavailable condition. When possible, create a reference outcome
that proves the case is solvable and the graders can recognize success.

Prefer deterministic checks for files, fields, state, tool arguments, forbidden
effects, and structural contracts. Use model or human judgment for open-ended
quality, with explicit rubrics, calibration, and an `unknown` escape. Grade
outcomes and artifacts rather than requiring one imagined trajectory unless
ordering or tool use is itself contractual.

Give graders a channel for reporting defects in the suite itself: an assertion a
clearly wrong output would also satisfy, an observed outcome no assertion
covers, or an assertion the preserved evidence cannot verify. Treat those as
findings against the suite and repair them between runs, never during one.

OpenAI recommends task-specific evaluation, continuous execution, automated
grading where possible, and human calibration.[^openai-evaluation-best-practices]
Anthropic recommends deterministic graders where possible, model graders where
necessary, and routine transcript review.[^anthropic-agent-evals]

## 5. Provision isolated attempts

For every intended-independent trial:

1. Start a fresh conversation and task-local environment.
2. Materialize only the declared target, catalog, fixtures, tools, and policy.
3. Prevent access to expected answers, previous trials, grader internals, and
   unrelated repository history.
4. Apply the same time, token, tool, retry, and cost budgets to controlled
   comparisons.
5. Record the complete environment and configuration identities before the
   trial begins.

Run comparison configurations close together or in randomized order so model,
service, and environment drift do not systematically favor one side. Anthropic's
Skill Creator runs with-skill and baseline attempts together and records their
outputs in separate workspace branches.[^anthropic-skill-creator]

## 6. Execute repeated trials

Run enough attempts to reveal decision-relevant variance. One attempt may serve
as an explicitly labeled authoring smoke; it does not establish stable model
behavior. Expand trials when a decision depends on an unstable result, a
critical case passes inconsistently, or graders disagree.

For each trial preserve:

- case, stage, configuration, and trial number;
- target and evaluation identities;
- selected skill or abstention for routing;
- transcript or trace and final user-visible response;
- output artifacts and decisive external state;
- side effects, permissions, costs, tokens, latency, and errors;
- uncertainties, workarounds, and review requests the trial reported about its
  own run;
- per-assertion grades with evidence; and
- outcome as pass, fail, unknown, or harness error.

Self-reported notes are observations, never grades. A workaround recorded during
a passing trial is direct evidence of a gap the assertions did not catch, and
silence from an unreliable narrator is not evidence of a clean run. Route
confirmed gaps to authoring instead of adjusting the outcome.

## 7. Inspect evidence before aggregating

Read a representative sample of passes, failures, unknowns, and disagreements.
Check whether:

- a pass used the skill rather than succeeding despite it;
- a pass depended on an undocumented workaround;
- a failure belongs to the skill, case, environment, harness, or grader;
- the grader rejected a valid alternative or rewarded a shortcut;
- shared state inflated performance or correlated failures;
- the skill widened authority, cost, or latency; and
- a persuasive final answer contradicts the produced artifact or external
  state.

Repair broken cases, graders, or harnesses and rerun affected trials. Do not
silently edit the target during a controlled evaluation.

## 8. Analyze routing and execution separately

Report routing misses, false positives, ambiguity handling, explicit controls,
and catalog collisions separately from activated-execution results. Preserve
case, trial, host, model, configuration, stage, and failure-class slices before
reporting an aggregate.

Classify each assertion by whether it separates the compared configurations
before reporting a pass rate. An assertion that passes with and without the
skill measures the task, not the skill; see
[Baselines, thresholds, aggregation, and slices](baselines-thresholds-aggregation-and-slices.md).

Apply critical gates before averages. A suite cannot compensate for executing
untrusted code, mutating beyond authority, or falsely claiming success by
passing unrelated cases. Report uncertainty and unknown coverage next to the
headline result.

## 9. State the supported conclusion

Use bounded language:

- **Supported** — representative evidence supports every material claim in the
  tested scope.
- **Partially supported** — useful behavior exists but a material claim or
  boundary does not hold.
- **Unsupported** — evidence contradicts a central claim.
- **Inconclusive** — identity, environment, trial, or grader evidence cannot
  decide.

Name the exact environment and exclusions. Evaluation evidence may inform an
audit or governance decision, but it does not make that decision.

## 10. Retain and refresh evidence

Keep routine run output in the generated workspace or CI artifact store. Promote
only the manifest required for an explicit release, admission, rollback, or
published benchmark decision. Preserve durable raw-evidence locators and
digests, reviewer independence, limitations, and expiry.

Refresh affected evidence when the skill instructions, description, resources,
suite, grader, harness, host, model, configuration, active catalog, authority
policy, intended cohort, or confirmed failure changes. Add confirmed field
failures to regression coverage and retire cases that no longer represent a
meaningful claim.

## Done when

- Routing and activated execution were isolated from one another.
- Cases include intended, adjacent, ambiguous, failure, and authority behavior.
- Comparisons, environments, budgets, trials, and graders support the stated
  decision.
- Raw outputs, artifacts, state, and grades are reviewable.
- Unknowns and evaluator failures remain distinct from skill failures.
- The conclusion is bounded to the exact tested identities and claim tier.
- Generated and promoted evidence follow an explicit lifecycle.

[^anthropic-agent-evals]: Anthropic — Demystifying evals for AI agents

[^anthropic-skill-best-practices]: Anthropic — Skill authoring best practices

[^anthropic-skill-creator]: Anthropic — Skill Creator

[^openai-evaluation-best-practices]: OpenAI — Evaluation best practices
