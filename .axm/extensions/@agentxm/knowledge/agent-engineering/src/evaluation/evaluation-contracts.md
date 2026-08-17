---
type: Reference
title: Evaluation contracts
description: Names the identities, assumptions, evidence, analysis, and decision fields required for an attributable evaluation.
tags: [evaluation-contract, target-identity, evidence, assumptions, disposition]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T21:14:15Z }
stale_after: 2027-02-14
sources:
  - id: nist-rmf
    resource: https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
    title: NIST — AI RMF Core
---

# Evaluation contracts

Define the contract before running candidates:

| Field       | Required question                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| Decision    | Which selection, release, diagnosis, admission, rollback, or retirement will this inform?                |
| Target      | Which exact model, prompt, context, tools, harness, skill, configuration, and revision are evaluated?    |
| Scope       | Which users, tasks, conditions, risks, and exclusions matter?                                            |
| Unit        | Is judgment attached to a response, action, trajectory, outcome, trial, task, cohort, or complete suite? |
| Cases       | Which distribution, sampling method, fixtures, and held-out boundaries apply?                            |
| Environment | Which state, authority, time, dependencies, and isolation conditions apply?                              |
| Evidence    | Which traces, outputs, artifacts, external state, costs, and incidents are captured?                     |
| Grading     | Which grader versions, rubrics, metrics, calibration evidence, and unknown states apply?                 |
| Trials      | How many independent attempts are required, and why?                                                     |
| Comparison  | Which baseline or alternative makes the result meaningful?                                               |
| Analysis    | Which aggregation, thresholds, slices, uncertainty, and failure taxonomy apply?                          |
| Provenance  | Who authored, ran, reviewed, and owns the evaluation, and when does evidence expire?                     |

NIST requires documented test sets, tools, metrics, deployment-like conditions,
uncertainty, and limitations on generalization.[^nist-rmf] Record missing or
untestable fields instead of silently narrowing the claim.

[^nist-rmf]: NIST — AI RMF Core
