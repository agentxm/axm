---
type: Guide
title: Assessing the path to production
description: Trace a change through the four delivery steps, compare observed results with acceptable limits and targets, and choose which finding to act on.
tags: [software-delivery, verification, cycle-time, landing-zones]
license: CC-BY-4.0
sources:
  - id: landing-zones
    title: Agile Landing Zones
    resource: https://wirfs-brock.com/rebecca/blog/2011/07/29/agile-landing-zones/
  - id: quality
    title: QA to AQ Part Two — Measuring and Monitoring Quality
    resource: https://hillside.net/plop/2014/papers/proceedings/papers/20-yoder.pdf
  - id: precision
    title: Landing Zone Targets — Precision, Specificity, and Wiggle Room
    resource: https://wirfs-brock.com/rebecca/blog/2011/08/05/landing-zone-targets-precision-specificity-and-wiggle-room/
---

# Assessing the path to production

Follow one recent change from the implementer’s first check to its effect in use. Record which revision, artifact and audience each observation covers. A pre-push check that determines whether a change can join main belongs under **Land**. A clean build on main that determines whether an artifact can ship belongs under **Release**. Use the [delivery measures](../foundations/delivering-a-software-change.md#see-whether-delivery-improves) to compare elapsed time, resource use, and the failures the workflow can detect.

## Decide what the current state means

Agile landing zones describe a few important product qualities using acceptable, target, and outstanding levels. Teams revisit those levels as they learn. Apply the same idea to delivery when the amount of improvement matters to a decision. [Rebecca Wirfs-Brock on agile landing zones](https://wirfs-brock.com/rebecca/blog/2011/07/29/agile-landing-zones/) · [Joseph Yoder and Rebecca Wirfs-Brock on measuring quality](https://hillside.net/plop/2014/papers/proceedings/papers/20-yoder.pdf)

| Field | What to establish |
| --- | --- |
| **Current** | Cite the observed value or state. Identify the workload, unit, sample or window, and where the evidence ends. |
| **Acceptable** | Cite the team’s agreed limit or condition. Show the direction for numeric limits, such as a maximum wait. If no limit is agreed, say so. |
| **Target** | State the outcome worth aiming for, how to verify it, and why it warrants the cost. Identify an agreed target’s source or label a recommendation **proposed**. |
| **Stretch** | Add a more ambitious outcome only when its benefit would affect a choice about time, cost, or coverage. |

Use the same measure and workload across a comparison. An individual run establishes what happened to that change. A percentile budget needs a comparable population of runs. A proposal can justify an experiment. A measured miss against an agreed limit can justify a correction. Revisit proposed targets after the experiment and identify any change in an agreed limit when comparing later assessments.

Observable states work for qualitative outcomes, such as whether a pilot user completed account recovery on the deployed build. A fixed obligation such as rejecting a package with a missing entry gets a pass or fail from an actual check. An absent run record leaves the result unverified. [Wirfs-Brock on choosing the right precision](https://wirfs-brock.com/rebecca/blog/2011/08/05/landing-zone-targets-precision-specificity-and-wiggle-room/) · [Specifying measurable qualities](../../requirements-engineering/authoring/authoring-quantitative-and-quality-requirements.md)

## Example assessment

This example uses an illustrative build trace and team policy. The policy accepts a runner wait of up to 15 minutes per main build. Release engineering has proposed a five-minute target.

**Overall summary.** Change D-42 reached production in 14 minutes 20 seconds. Keep the early recovery-label check and the installation test on the main artifact. The largest observed wait was for a runner. Customer recovery remains unverified.

| Step | Summary |
| --- | --- |
| **Implement** | The local label check gave the author feedback in 72 seconds. |
| **Land** | The checked revision reached shared main three minutes after work began. |
| **Release** | The same tested archive reached production. The build’s runner wait was acceptable and above the proposed target. Pilot exposure is configured. |
| **Confirm** | The trace ends before a pilot sign-in result is recorded for this build. |

### Release

**1. Waiting for a main build runner.** The run log records ten minutes in the queue followed by thirty seconds of execution. A faster test would save little of this change’s elapsed time.

| Current | Acceptable | Target |
| --- | --- | --- |
| 10 minutes from enqueue to start for D-42 | ≤15 minutes per run, agreed in team policy | ≤5 minutes per run, proposed to shorten release feedback |

**A. Compare recent main builds.** Separate queue and execution times for comparable runs to see how often the wait recurs. A scheduling trial should measure time to release and runner-minutes while retaining the package-install check.

### Confirm

**2. Recovery for pilot customers.** **Current** — The deployment record identifies the build. The pilot check is configured and its outcome is unverified. **Acceptable** — The team has agreed that confirmation requires evidence of recovery in the intended cohort. **Target** — The proposed target for this release is a pilot recovery result tied to the build. While waiting for traffic, identify who will follow that observation.

**B. Look up the pilot recovery result.** Match the exposure record and a representative sign-in to the build and cohort. A failed sign-in warrants follow-up on the released behavior.

A reader can choose A, B, both, or done. In a finding with an evidenced remedy, offer the edit by name, such as **Remove the duplicate pre-push verification**. Carry that finding’s baseline and failure case into the improvement so the reader can compare its measured effect.
