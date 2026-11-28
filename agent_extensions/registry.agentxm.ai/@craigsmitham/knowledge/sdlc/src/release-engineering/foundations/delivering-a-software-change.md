---
type: Explanation
title: Delivering a software change
description: Follow one change through Implement, Land, Release, and Confirm, from the first useful check to evidence that the change works for its intended users.
tags: [software-delivery, cycle-time, verification, release-engineering]
status: draft
generated: { by: codex/gpt-6, at: 2026-11-27T23:48:04Z }
---

# Delivering a software change

A developer or coding agent owns a change through integration on shared main. Delivery continues from a verified main revision to the intended audience. The outcome agreed in **Spec** supplies the question to answer in **Confirm**. The [software engineering lifecycle](../../software-engineering-lifecycle.md) places this work in the life of the product.

Consider an account recovery fix. A customer requests a second recovery email, then follows the link in the first. The team wants that customer to see a clear message and regain access using the current link. A passing local check, a deployed binary, and a successful recovery answer three different questions.

| Step | Decision | Evidence for the recovery fix |
| --- | --- | --- |
| **Implement** | Does a small working change produce the intended behavior? Use a checkout, worktree, or temporary branch as appropriate. | Reproduce the two-email case, make the fix, and exercise both the expired link and the current one. |
| **Land** | Does the change still work with the software it will join? The implementer reconciles with current main, completes the repository’s integration checks, and lands the change. | Another agent changed the token issuer. Run the issuer and recovery handler together on the combined revision. Carry forward unrelated results and verify the change reached shared main. |
| **Release** | Which artifact can reach which users? Deploy or publish the artifact from the verified main revision. Follow any scheduled release, flag, or staged rollout through exposure. | Staff can exercise the fix after deployment. Customers receive it when recovery is enabled for their accounts. Track the deployed build and audience separately. |
| **Confirm** | Can the intended audience now complete the task? Observe the behavior in use and follow an adverse result through containment and recovery. | Check that customers who request a second email reach a successful sign-in. If traffic has yet to exercise the path, identify the signal being watched and who follows it. |

Verification runs throughout these steps. Choose the fastest path with sufficient evidence for the decision, including the time a late failure would cost the team. With comparable timing, conserve compute, environment capacity, and developer attention. Give each failure a place where a check can detect it in time to act. Reuse a result while its inputs and the behavior it exercised still apply. Required checks and release policy come from the repository.

## Understand a repository’s path to production

Follow a recent change from the implementer’s first check to its effect in use. A repository’s **path to production** includes the actual commands, hooks, CI runs, artifact, deployment targets, exposure controls, and observations along that route. A workflow file tells you when a check is configured to run. A run record tells you whether it ran, what revision it exercised, and how long the change waited. Trace the evidence that exists and label gaps in the record. [Thoughtworks on path-to-production mapping](https://www.thoughtworks.com/radar/techniques/path-to-production-mapping)

For each consequential check, establish **which failure it catches, which decision needs its result, what inputs and environment it exercises, and who acts on failure**. Two runs of the same command can answer different questions. A clean installation of a built package can expose a missing file that every test in the checkout had available. The [direct-to-main guide](../guides/direct-to-main-delivery.md) covers hook placement, concurrent changes, CI, deployment, and rollout.

## See whether delivery improves

Connect the change revision to its check runs, the artifact to its release, and the release to an observation. Use existing timestamps and results where possible. Compare similar changes over time and revisit the placement of a check when a failure escapes or a queue recurs.

| Quality | What to track | What a finding might mean |
| --- | --- | --- |
| **Speed** | Time from starting work to the first actionable result and to confirmation in use. Break out waits to land, release, and observe. Separate queue time from execution and inspect typical and slow changes. | An eight-minute CI run that waits twenty minutes for a runner offers more opportunity in the queue than in the test code. |
| **Efficiency** | Runner-minutes per delivered change, retries on equivalent inputs, scarce environment use, and human interventions. | Parallel runners can cost more while shortening delivery. Running an identical check twice on the same artifact warrants looking for a distinct purpose. |
| **Verification coverage** | For the changed behavior and consequential failure modes, record what was exercised in which environment before each decision. For an escaped defect, find the earliest practical point that could have detected it. | A fixture-based test passed, but a real producer changed its response. A compatibility check on the combined change would have answered the open question. |
| **Production outcome** | Intended behavior observed, changes awaiting confirmation, deployments requiring correction, and time to recover. | If landing gets faster while recovery takes longer, include that rework in the delivery comparison. |

A configuration with no run history can support a finding about a missing check or a proposed measurement. Quantifying a time saving requires a baseline and a comparable observation after the change. DORA’s change lead time runs from commit to production. Time from work started to behavior confirmed adds the implementation and observation intervals relevant to this delivery model. [DORA’s software delivery metrics](https://dora.dev/guides/dora-metrics/)
