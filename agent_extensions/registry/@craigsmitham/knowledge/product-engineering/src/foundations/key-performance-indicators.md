---
type: Explanation
title: "Key performance indicators: measures, targets, and decisions"
description: How KPIs connect selected measures to objectives and decisions, how definitions and context shape their meaning, and how they relate to outcome evidence, Alleman's measures, and service levels.
tags: [kpi, key-performance-indicators, metrics, measurement, targets, outcomes, evidence, pe-foundations]
status: draft
sources:
  - id: gds-metrics
    resource: https://www.gov.uk/service-manual/measuring-success/how-to-set-performance-metrics-for-your-service
    title: GOV.UK Service Manual — How to set performance metrics for your service
  - id: gds-data
    resource: https://www.gov.uk/service-manual/measuring-success/using-data-to-improve-your-service-an-introduction
    title: GOV.UK Service Manual — Using performance data to improve your service
  - id: heart
    resource: https://research.google.com/pubs/archive/36299.pdf
    title: Rodden, Hutchinson, and Fu — Measuring the User Experience on a Large Scale (2010)
  - id: outcomes
    resource: ../problem/outcomes-and-evidence.md
    title: Outcomes and evidence
  - id: alleman
    resource: alleman-performance-based-project-management.md
    title: Glen Alleman's performance-based project management
  - id: service-levels
    resource: service-level-indicators-objectives-and-agreements.md
    title: "SLIs, SLOs, and SLAs: service measures, objectives, and agreements"
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Key performance indicators: measures, targets, and decisions

A **key performance indicator (KPI)** is a quantitative measure selected to
judge performance against an important objective and inform decisions. “Key”
describes its importance in a particular decision context. It does not describe
a special formula, require a financial measure, or make every number on a
dashboard a KPI.

This explanation uses that working definition to connect product, project,
and operational measurement. GOV.UK's service guidance grounds measurement in
service purpose, intended benefits, and hypotheses, and combines metrics with
user research. Its mandated public-service reporting measures belong to that
setting; the portable lesson is to select measures for the service's purpose.
The decision roles and rental example below are this bundle's
interpretation.[^gds-metrics]

## Separate the measure from the ambition

Consider [Northbank Equipment](../northbank-equipment.md) in a later two-depot
measurement period, after the separate controlled one-depot pilot.
The team wants contractors to obtain dependable equipment confirmations before
dispatching their crews. It selects the proportion of eligible rental requests
confirmed before the contractor's dispatch deadline as a KPI.

Several distinct statements surround that choice:

| Concept | Meaning in this example |
| --- | --- |
| Objective | Help contractors make dependable crew-dispatch decisions |
| Measurement | A request arrived at 08:10; its confirmation arrived at 08:14 |
| Metric | Percentage of eligible requests confirmed before their dispatch deadline |
| KPI | That metric selected for regular review of the confirmation objective |
| Baseline | 82% in an identified earlier period, using the same definition |
| Target | At least 92% during the agreed evaluation period |
| Observed result | 89% in the latest completed period |
| Decision threshold | A condition that prompts investigation or a change of course |

The metric defines what is calculated; the target states a desired level.
The result reports what was observed. A threshold might trigger investigation
before the target is missed, or require sustained evidence before an expensive
intervention. It need not equal the target.

Here, *measurement* means an observation and *metric* means a defined quantity
derived from observations. These terms vary across organizations. GOV.UK
illustrates the distinction by deriving a completion rate from counts of
attempts and completions.[^gds-data] Counts, durations, costs, and ratios can
all be useful metrics; percentages are not a requirement for KPI status.

## Connect the number to a decision

Rodden, Hutchinson, and Fu's Goals–Signals–Metrics process connects a product
goal to observable signs of success or failure, then to a metric. Their HEART
framework offers user-experience categories from which to choose; it does not
require every product to measure every category.[^heart]

Applied to the rental service, the reasoning might be:

- **Goal:** contractors can make dispatch decisions with dependable information.
- **Signal:** they receive a usable confirmation before the decision is due.
- **Metric:** the proportion of eligible requests confirmed before that deadline.
- **Decision:** whether the next investment should improve the confirmation
  workflow, inventory coordination, or the underlying service proposition.

The final connection is our addition: the selected number should have an
identified use. A product lead might review it weekly with depot operations,
examine why deadlines were missed, and decide where to investigate. Engineering
may use queue depth or integration delay to diagnose a finding without making
every diagnostic measure a product KPI.

The same metric can therefore be a KPI for one team and background information
for another. Selection is a responsibility to interpret and act, not a reward
for producing a dashboard. An owner is accountable for that interpretation;
ownership does not imply control over every cause of the result.

## The definition determines what the result means

“Confirmation rate” leaves too much undecided. Suppose this example adopts
the following operational definition:

| Part of the definition | Illustrative choice |
| --- | --- |
| Population | Routine rental requests at Central and Riverside, submitted at least one hour before the customer's recorded dispatch deadline |
| Denominator | Distinct eligible requests whose dispatch deadline falls in the reporting week |
| Numerator | Those requests with a confirmation issued before that deadline and still valid at the deadline |
| Unit and calculation | Percentage: numerator divided by denominator, multiplied by 100 |
| Boundaries | Collapse duplicate submissions into one request; exclude test records; retain unfulfilled and cancelled eligible requests |
| Time basis | Weeks use the depots' agreed reporting timezone; eligibility uses the deadline recorded on submission |
| Evidence | Request and confirmation histories, with a defined rule for late-arriving records |
| Review | Weekly product and depot review; retain counts and depot breakdowns alongside the percentage |

These are fictional choices, not a recommended rental-industry standard.
Keeping cancellations in this particular denominator prevents a late
cancellation from silently erasing a missed opportunity. It also means
customer-initiated cancellations need separate interpretation: they need not
indicate a service failure.

A zero denominator produces no rate, not a perfect result. Missing confirmation
history creates uncertainty about classification; it does not establish a
failure or a success. The report needs a visible account of incomplete evidence
and how the calculation handles it.

The chosen definition also leaves a gap: a confirmation can be valid at dispatch
and fail later. That gap leads to another observation, such as whether the
promised equipment was actually available. Refining the evidence is more useful
than quietly treating the first KPI as a complete statement of customer value.

## Read performance with its context

An observed increase does not identify its cause. As
[Outcomes and evidence](../problem/outcomes-and-evidence.md) explains,
shipping a change and observing a better result do not by themselves establish
that the change created the intended benefit.[^outcomes]

Suppose the rental KPI rises from 82% to 89%. The team still needs to understand
whether the workflow improved, requests became easier, the deadline rule
changed, or one depot supplied more of the week's volume. A useful comparison
keeps the definition stable and examines the relevant differences in conditions.

Aggregation can change the apparent story. If one depot confirms 90 of 100
eligible requests and another confirms 1 of 10, the combined rate is 91/110,
or about 82.7%. Averaging the depot percentages gives 50%, which answers a
different question by weighting the depots equally. The intended population
determines the appropriate calculation.

GOV.UK's guidance uses segmentation and follow-up user research to investigate
differences in service performance.[^gds-data] Here that could mean examining
urgent requests separately, then observing contractors whose confirmations
arrived too late. A percentage points to an inquiry; it does not explain their
circumstances.

## Leading, lagging, diagnostic, and guardrail roles

These labels describe uses of measures relative to a particular result:

| Role | Rental example | Limit of the interpretation |
| --- | --- | --- |
| Lagging indicator | Equipment was available when promised | Reports an outcome after the relevant experience |
| Leading indicator | Inventory assignments completed before the dispatch deadline | May anticipate dependable fulfillment only if that relationship holds |
| Diagnostic measure | Time requests spend awaiting depot review | Helps investigate a bottleneck without proving its ultimate effect |
| Guardrail measure | Withdrawals after confirmation | Exposes a harmful tradeoff while the team improves confirmation timeliness |

A timely confirmation can lag an interface change while leading the later
equipment handover. “Leading” is therefore relative to a named outcome and a
proposed relationship; collecting a number earlier does not make it predictive.
Any of these roles can be important enough to warrant KPI status.

In the example, rewarding confirmation speed alone could encourage depot staff
to confirm before securing inventory. The headline rate would improve while
contractors faced more broken promises. Reviewing withdrawal and fulfillment
evidence changes what the team can reasonably conclude from the headline KPI.
It also gives the team a reason to revise the target or the workflow instead
of pursuing the rate regardless of consequences.

## How KPIs relate to Alleman's measures and service levels

Alleman's terminology distinguishes what a measure establishes about a
capability or system. KPI selection expresses its importance for managing an
objective. These are different dimensions of the same measurement practice,
so the labels can overlap.[^alleman]

| Term | Relationship to KPI selection |
| --- | --- |
| Measure of Effectiveness (MoE) | Evidence of operational purpose being achieved under stated conditions can be selected as a KPI |
| Measure of Performance (MoP) | A functional or physical performance measure can also be selected as a KPI |
| Key Performance Parameter (KPP) | A critical characteristic with a threshold that can force reconsideration; “key” does not make it synonymous with KPI |
| Technical Performance Measure (TPM) | Tracks a technical attribute against its expected or required level; whether it belongs in a particular KPI review depends on the decision |
| Service Level Indicator (SLI) | A service-quality measure that can be selected as a KPI when it is central to the objective |
| Service Level Objective (SLO) | A target for service performance; the target itself is not an indicator |
| Service Level Agreement (SLA) | An agreement about service levels and consequences; the agreement itself is not an indicator |

The [Alleman explainer](alleman-performance-based-project-management.md#define-what-done-means)
develops his measure roles. The
[service-level explainer](service-level-indicators-objectives-and-agreements.md)
owns the SLI/SLO/SLA definitions and their measurement
boundaries.[^service-levels] SLO attainment or SLA breaches can themselves be
measured, but those derived measures need their own definitions.

For the rental service, fast confirmation-page responses may be an important
technical KPI. They cannot establish that contractors receive dependable
equipment commitments. Operational effectiveness requires evidence about the
capability in use, including the people and arrangements beyond the page.

## Keep the measure useful as the product changes

Treat the KPI's definition, target, observed history, and interpretation as
related records. If the rental service expands to emergency rentals, the old
one-hour eligibility rule may omit the customers now most important to serve.
Changing the definition can be justified, but the resulting series should show
where comparability changed. Preserve the previous basis rather than making
earlier results appear to have used the new rule.

The review can then distinguish three decisions: improve performance against
the existing objective, improve the evidence used to judge it, or reconsider
the objective itself. Retire KPI status when the measure no longer informs a
key decision; it may remain useful for diagnosis or historical comparison.

## Compare product and engineering observations carefully

The Northbank figures are a later two-depot exhibit, not measured effects of
the six-week bet or the one-depot pilot. The 82%, 89%, and 92% numbers illustrate
baseline, observation, and target under the stated population. Keep denominator
changes and missing histories visible.

In the [engineering-system episode](../engineering/northbank-engineering-system.md),
check duration, omitted-check incidents, and maintenance effort can inform a
different decision. Deleted lines do not establish customer value, and a faster
pipeline does not establish correct allocations. The next question is which
observation bears on the outcome being considered.

## Continue exploring

- [Outcomes and evidence](../problem/outcomes-and-evidence.md) develops the
  connection between delivered work, observed results, and customer value.
- [Glen Alleman's performance-based project management](alleman-performance-based-project-management.md)
  connects capability evidence to plans, resources, risk, and forecasts.
- [SLIs, SLOs, and SLAs](service-level-indicators-objectives-and-agreements.md)
  develops service-quality measurement, targets, agreements, and error budgets.

For the wider learning sequence, follow the
[value and evidence route](../reading-product-engineering.md#value-and-evidence).

[^gds-metrics]: [GOV.UK Service Manual — How to set performance metrics for your service](https://www.gov.uk/service-manual/measuring-success/how-to-set-performance-metrics-for-your-service), especially purpose, benefits, hypotheses, and combining metrics with research.
[^gds-data]: [GOV.UK Service Manual — Using performance data to improve your service](https://www.gov.uk/service-manual/measuring-success/using-data-to-improve-your-service-an-introduction), especially “Metrics and measurements” and using segmented results to inform research.
[^heart]: [Rodden, Hutchinson, and Fu — Measuring the User Experience on a Large Scale](https://research.google.com/pubs/archive/36299.pdf), CHI 2010, especially HEART and Goals–Signals–Metrics. The rental application is original to this explanation.
[^outcomes]: [Outcomes and evidence](../problem/outcomes-and-evidence.md) supplies this bundle's distinction between output, outcome, and evidence of value.
[^alleman]: [Glen Alleman's performance-based project management](alleman-performance-based-project-management.md#define-what-done-means), including its primary-source references for MoE, MoP, KPP, and TPM. Their relationship to KPI selection is this bundle's interpretation.
[^service-levels]: [SLIs, SLOs, and SLAs: service measures, objectives, and agreements](service-level-indicators-objectives-and-agreements.md) supplies the service-level terminology used here.
