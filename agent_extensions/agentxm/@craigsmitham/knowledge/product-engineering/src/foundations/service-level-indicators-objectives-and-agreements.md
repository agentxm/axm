---
type: Explanation
title: "SLIs, SLOs, and SLAs: service measures, objectives, and agreements"
description: How service-level indicators, objectives, and agreements connect user experience to measured reliability, how measurement boundaries and error budgets shape decisions, and how service levels relate to product outcomes.
tags: [sli, slo, sla, service-levels, reliability, measurement, error-budgets, pe-foundations]
status: draft
sources:
  - id: sre-objectives
    resource: https://sre.google/sre-book/service-level-objectives/
    title: Google SRE — Service Level Objectives
  - id: sre-implementation
    resource: https://sre.google/workbook/implementing-slos/
    title: The Site Reliability Workbook — Implementing SLOs
  - id: sre-risk
    resource: https://sre.google/sre-book/embracing-risk/
    title: Google SRE — Embracing Risk
  - id: sre-alerts
    resource: https://sre.google/workbook/alerting-on-slos/
    title: The Site Reliability Workbook — Alerting on SLOs
  - id: sre-policy
    resource: https://sre.google/workbook/error-budget-policy/
    title: The Site Reliability Workbook — Example Error Budget Policy
  - id: kpi
    resource: key-performance-indicators.md
    title: "Key performance indicators: measures, targets, and decisions"
  - id: outcomes
    resource: ../problem/outcomes-and-evidence.md
    title: Outcomes and evidence
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# SLIs, SLOs, and SLAs: service measures, objectives, and agreements

A service-level indicator measures an aspect of service quality. A service-level
objective states the target for that measure. A service-level agreement sets
expectations between parties, including consequences when the agreed service
levels are missed. They connect observation, desired performance, and an
agreement, respectively.[^sre-objectives]

This explanation follows Google SRE's terminology. The fictional rental service
and its numbers are illustrations, not proposed operating targets or agreement
terms. The concepts live in Foundations because they inform product promises,
requirements, engineering tradeoffs, and operations. Applied production practice
belongs in [How to run it](../operations/).

## Three statements about one service

Suppose a contractor using [Northbank Equipment](../northbank-equipment.md)
opens a rental confirmation before dispatching a crew.
The service should return the current confirmation promptly. That intention
can lead to three different statements:

| Term | Question | Illustrative statement |
| --- | --- | --- |
| Service Level Indicator (SLI) | What service quality do we observe? | The proportion of eligible confirmation reads completed correctly within two seconds |
| Service Level Objective (SLO) | What level do we aim to achieve, over what period? | At least 99.9% of eligible reads meet that condition over a rolling 28-day window |
| Service Level Agreement (SLA) | What have the parties agreed, and what follows from a miss? | A customer agreement defines the covered service, measurement period, qualifying failures, and a service credit under specified conditions |

In this usage, consequences distinguish an SLA from a statement of an SLO.
Consequences can take forms other than a financial penalty. An SLO can exist
without an SLA, and an SLA can contain several objectives. Whether an audience
is internal or external does not alone determine which term applies.
Google's account also describes using tighter internal objectives to provide
room to respond before an external commitment is missed.[^sre-objectives]

For the rental service, an internal 99.9% target and an agreement mentioning
99.5% are comparable only after inspecting what each counts. A rolling window
and a calendar month can disagree about the same incident. Different exclusions
or measurement locations can create further differences. A missed internal
SLO therefore does not by itself establish an SLA breach.

## Begin with the experience being promised

The workbook distinguishes an **SLI specification**, describing the relevant
service outcome, from an **SLI implementation**, describing how it is measured.
Server logs, synthetic probes, and client instrumentation each observe different
parts of an experience and have different coverage limits.[^sre-implementation]

For the contractor, “the server responded” is incomplete. The response might
show a withdrawn confirmation as still valid, arrive after the crew has left,
or never reach the screen. The example's specification therefore concerns a
correct, timely read, while the chosen telemetry must explain which of those
conditions it can establish.

Different service promises need different dimensions of measurement. The
workbook discusses availability and latency alongside freshness, durability,
correctness, quality, and coverage.[^sre-implementation] Applied here:

| Experience | Possible measurement question |
| --- | --- |
| Read a confirmation | Was a correct result received within the acceptable delay? |
| See a depot's latest withdrawal | How old was the information presented? |
| Retain a confirmed commitment | Did the stored record remain recoverable? |
| Receive a daily availability feed | Were the expected records present by the agreed delivery time? |

One percentage cannot silently stand for all four promises. A team may combine
conditions into one good-event definition or use separate indicators, but it
needs to explain what a pass establishes. Separate diagnostic measures can
help identify which condition failed.

## Define the events before counting them

For the worked example, suppose the service uses the following definition:

- An eligible event is a production confirmation-read attempt by an authorized
  contractor in the supported application, recorded at the client start point.
- A good event returns the authorized, current confirmation state to that
  client within two seconds of the attempt starting.
- Each retry is another attempt. Known errors and timeouts count as bad events.
  Test traffic is excluded; planned maintenance is included.
- Client and service records are correlated to establish completion and
  correctness. Classification requires adequate evidence for both.

These choices deliberately measure attempts, not eventual task completion.
A contractor who succeeds on the third try has experienced two bad events and
one good event. A separate journey measure might count one completed task;
that would answer a different question.

The measurement boundary matters even with client instrumentation. Attempts
that fail before the instrumented start point remain outside this definition.
If telemetry is lost, the team needs an explicit treatment of unknown events
and evidence about coverage. It cannot infer successful service from an empty
error stream. With no eligible events, this ratio is undefined.

For the calculation below, assume a complete, reconciled event set in which
every eligible attempt is classified. That assumption makes the arithmetic
possible; a production report would need to substantiate it.

When a service objective is to become an accepted obligation,
[Authoring quantitative and quality requirements](../solution/requirements/authoring/authoring-quantitative-and-quality-requirements.md)
provides the practical continuation: specify conditions, measurement, thresholds,
and evidence. Defining an indicator or target alone does not establish its authority.

## From an SLO to an error budget

For an event-ratio SLI, the error budget is the proportion of bad events allowed
by the objective. Multiplying that fraction by the eligible event count gives
the corresponding budget for a measured window.[^sre-implementation]

For an arithmetic exhibit, suppose a 28-day window contains 1,000,000 eligible
attempts and 900 bad attempts. This is a numerical illustration, separate from
Northbank's pilot and later two-depot measurement scenario:

| Quantity | Calculation | Result |
| --- | --- | --- |
| Good attempts | 1,000,000 − 900 | 999,100 |
| Observed SLI | 999,100 / 1,000,000 | 99.91% |
| SLO target | Agreed minimum good-event ratio | 99.9% |
| Allowed bad-event fraction | 1 − 0.999 | 0.001, or 0.1% |
| Error budget for this window | 1,000,000 × 0.001 | 1,000 bad attempts |
| Budget consumed | 900 / 1,000 | 90% |
| Budget remaining | 1,000 − 900 | 100 bad attempts |

The objective is currently met, but most of the budget has been consumed.
That distinction gives the team more information than a green status alone.

The remaining 100 is a snapshot, not a fixed allowance for the next deployment.
In a rolling window, old events leave and new events enter; both the eligible
count and the bad-event count change. In a calendar window, the reporting
boundary instead fixes which month's events belong together. State the
window and its time basis wherever the result informs a decision.

This request-based budget is also not an allowance of downtime minutes.
A five-minute outage during a busy period can affect many more attempts than
one during a quiet period. A time-based availability measure would use a
different denominator and require its own definition.

## Choose reliability in relation to its value and cost

Google's risk discussion treats reliability as an investment decision: further
reliability has costs, and those costs need to be considered against the value
to users and the organization.[^sre-risk] The target is therefore a product
and operating decision informed by engineering evidence.

For this rental service, delayed confirmation at dispatch may matter much more
than delayed browsing the previous evening. That could justify a separate
objective for the critical journey. Simply tightening every endpoint's target
would not explain which customer consequence the investment addresses.

Current performance supplies a baseline, while customer needs and dependency
limits help assess whether the proposed target makes sense. A target requiring
substantial improvement needs a credible investment and operating plan. A
target that is easily achieved may still omit the experience that matters.
The team should be able to explain the tradeoff when either is proposed.

Aggregation deserves the same scrutiny. If almost all traffic comes from one
well-served depot, the overall SLI can conceal poor service at another. An
overall objective and a depot-specific view can both be useful, provided their
different claims stay visible. Evidence that the fleet average passed does not
establish that every contractor received the promised experience.

## Use budget consumption to inform action

**Burn rate** compares the observed bad-event rate with the rate allowed by
the SLO. Google develops alerts that consider both the rate and the duration
of budget consumption, so fast deterioration and slower persistent problems
can receive appropriate responses.[^sre-alerts]

With this example's 0.1% allowed bad-event rate, a recent measured rate of 0.5%
has a burn rate of 5: `0.5% / 0.1% = 5`. That observation signals deterioration
even while the full 28-day window still meets its objective. It is not a
complete forecast of exhaustion; the forecast also depends on future traffic,
failure behavior, the remaining budget, and events leaving the window.

The burn rate does not choose the remedy. In the rental service, investigation
might identify a slow inventory dependency, a bad release, or missing telemetry.
Those findings imply different actions. The alert's purpose is to bring the
condition to someone who can respond while the response remains useful.

An **error-budget policy** connects the measured state to agreed decisions.
Google's example policy specifies release restrictions, reliability work,
exceptions, and escalation when the budget is exhausted. It illustrates a
policy, not a universal consequence of defining an SLO.[^sre-policy]

For this service, the team might agree to defer a rollout that increases load
while investigating sustained budget consumption. The policy would need to
state who decides and what evidence supports resuming it. An SLO without that
connection can become a report that no one uses. Changing a definition or target
should remain visible in the history; it should not rewrite what happened
under the earlier commitment.

[Condition-based and predictive maintenance](condition-based-and-predictive-maintenance.md)
develops the diagnosis, warning time, and intervention reasoning behind acting
on deterioration. An error-budget signal describes service performance against
an objective; it does not itself identify a failure mechanism or choose a remedy.
The [maintenance strategy comparison](maintenance-strategies.md) considers
when a schedule, condition evidence, or deliberate acceptance of failure fits.

## Service quality and product success

An SLI can be selected as a KPI when it is central to an important objective.
KPI status concerns its decision role; SLI status concerns what it measures.
The [KPI explainer](key-performance-indicators.md) develops that relationship
and distinguishes both from targets and agreements.[^kpi]

Meeting the rental read SLO establishes a bounded claim about service quality.
It cannot establish that contractors understood the confirmation, that the
depot fulfilled it, or that crews avoided idle time. Those need evidence about
the capability in use and its consequences. This follows the bundle's
distinction between delivered output and observed product
outcomes.[^outcomes]

Service levels nevertheless matter to that outcome: a contractor cannot rely
on a confirmation they cannot retrieve. A useful evidence chain therefore
connects dependable technical behavior to the broader experience while
preserving what each measure can actually show.

## Carry the promise into deployment evidence

Northbank's [engineering-system change](../engineering/northbank-engineering-system.md)
identifies the deployed artifact and runs a current smoke assessment. That
bounded observation can expose a broken status route; it cannot establish a
28-day service objective. A historical build cache hit cannot establish either
current runtime health or client-visible correctness.

The [receipt incident](../delivery/work-items/northbank-receipt-incident.md)
concerns a different service function and failure boundary. Its restoration
does not determine whether the confirmation-read agreement was breached.
Each claim needs the applicable events, period, and evidence.

## Continue exploring

- [Key performance indicators](key-performance-indicators.md) explains how
  selected measures inform objectives and decisions.
- [Outcomes and evidence](../problem/outcomes-and-evidence.md) connects service
  behavior to evidence of customer and organizational benefit.
- [Glen Alleman's performance-based project management](alleman-performance-based-project-management.md#define-what-done-means)
  distinguishes evidence of operational effectiveness from system performance.
- [How to run it](../operations/) owns production responsibilities and the
  future operational guidance that applies these concepts.

For the wider learning sequence, follow the
[continuity and change route](../reading-product-engineering.md#continuity-and-change).

[^sre-objectives]: [Google SRE — Service Level Objectives](https://sre.google/sre-book/service-level-objectives/), especially the SLI/SLO/SLA distinctions and internal margins around external expectations.
[^sre-implementation]: [The Site Reliability Workbook — Implementing SLOs](https://sre.google/workbook/implementing-slos/), especially SLI specification versus implementation, service-quality dimensions, and event-ratio error budgets. The rental event definition and calculations are this explanation's worked application.
[^sre-risk]: [Google SRE — Embracing Risk](https://sre.google/sre-book/embracing-risk/) develops the economic tradeoff behind reliability objectives.
[^sre-alerts]: [The Site Reliability Workbook — Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/) develops burn rate and alerting across different time windows.
[^sre-policy]: [The Site Reliability Workbook — Example Error Budget Policy](https://sre.google/workbook/error-budget-policy/) illustrates how an organization can turn budget state into decisions and escalation.
[^kpi]: [Key performance indicators: measures, targets, and decisions](key-performance-indicators.md) supplies the distinction between a measure's subject and its role in a decision.
[^outcomes]: [Outcomes and evidence](../problem/outcomes-and-evidence.md) supplies the distinction between output and evidence of customer or organizational benefit.
