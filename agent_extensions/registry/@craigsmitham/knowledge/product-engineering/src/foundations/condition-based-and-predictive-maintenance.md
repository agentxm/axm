---
type: Explanation
title: "Condition-based and predictive maintenance: observation, forecasts, and intervention"
description: How condition-based and predictive maintenance connect observed deterioration and forecasts to intervention, why warning time and diagnostic meaning matter, and where software signals and models can mislead.
tags: [maintenance, condition-based-maintenance, predictive-maintenance, condition-monitoring, software-aging, prognosis, pe-foundations]
status: draft
sources:
  - id: ibm-condition
    resource: https://www.ibm.com/think/topics/condition-based-maintenance
    title: IBM — What is condition-based maintenance?
  - id: doe-maintenance
    resource: https://www.energy.gov/sites/default/files/2020/04/f74/omguide_complete_w-eo-disclaimer.pdf
    title: DOE — Operations and Maintenance Best Practices Guide, Release 3.0 (2010)
  - id: ibm-aging
    resource: https://research.ibm.com/publications/proactive-management-of-software-aging
    title: Castelli and colleagues — Proactive management of software aging (2001), abstract
  - id: sre-monitoring
    resource: https://sre.google/sre-book/monitoring-distributed-systems/
    title: Google SRE — Monitoring Distributed Systems
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Condition-based and predictive maintenance: observation, forecasts, and intervention

Condition-based maintenance uses evidence of present condition to justify
intervention. Predictive maintenance adds an estimate of future condition or
failure risk. IBM makes this distinction between current assessment and
future behavior; DOE's maintenance guide uses *predictive* more broadly for
condition-informed work.[^ibm-condition][^doe-maintenance] This explanation
uses the narrower distinction to make the role of a forecast visible.

The question is how evidence makes intervention timely. The fictional rental
service and the decision reasoning below are this bundle's synthesis. They
illustrate the concepts without prescribing monitoring thresholds or claiming
that all software failures are predictable.

## Observation, diagnosis, and prognosis do different work

A vibration reading is an observation. Interpreting a vibration pattern as
evidence of bearing damage is a diagnosis. Estimating how that damage will
develop is a prognosis. IBM describes vibration monitoring among the methods
used to detect equipment abnormalities.[^ibm-condition] Measurement supplies
evidence for these judgments; it does not collapse them into one operation.

Consider a receipt worker at [Northbank Equipment](../northbank-equipment.md).
Its memory use has
risen. That observation could reflect a useful cache, a larger batch, or a
resource leak. Intervening solely because the number is high could discard
useful state without addressing a fault. Comparing memory after similar jobs
and after idle periods would help distinguish competing explanations.

Suppose the evidence instead shows unreleased resources accumulating after
each completed receipt. Draining and restarting when remaining headroom
crosses a justified boundary is a condition-based policy. Forecasting when
the worker will exhaust its headroom, then arranging a restart before that
point, adds prediction.

This has a direct software research precedent: Castelli and colleagues'
abstract describes detecting resource exhaustion, estimating time remaining
to a critical level, and triggering rejuvenation.[^ibm-aging] It supports the
existence of that approach, not the accuracy of a model for this service.

## Warning is valuable when action can finish in time

Google SRE treats saturation as including predictions of approaching resource
limits, and distinguishes symptoms from causes in monitoring.[^sre-monitoring]
A prediction becomes useful for maintenance only when it supports an action
that can protect the required function.

For illustration, suppose a worker has 600 MB of usable headroom and its
unreleased memory has recently grown at 100 MB per hour. A simple constant-rate
projection gives six hours to exhaustion. That is a conditional estimate:
changing receipt sizes, traffic, or allocation behavior can change the rate.
It is not a measured remaining lifetime.

If draining, replacing, warming, and checking a worker takes forty minutes,
a warning six hours ahead could allow a planned intervention. If detection
arrives only ten minutes before exhaustion, accurate diagnosis may still come
too late. The practical time budget includes sampling delay, interpretation,
coordination, execution, and confirmation that useful service has recovered.

This reasoning extends the familiar distinction between detectable
deterioration and functional failure. A signal must become interpretable early
enough to act. Some failure modes offer little observable progression, and a
forecast trained on gradual degradation may miss a sudden change entirely.

## A health indicator is evidence about a particular function

The worker can have abundant memory while generating incorrect receipts.
Correct receipt totals and resource headroom concern different failure modes.
No single healthy-looking graph establishes the health of the entire product.

Structural software deterioration presents another measurement problem.
Suppose changes to receipt formatting increasingly require edits across many
unrelated modules. That can be a reason to investigate lost separation of
responsibilities. It is not, by itself, a calibrated prediction of the next
incident. A new requirement may legitimately span those modules. Understanding
the design and change history helps interpret the signal.

The same caution applies to age, code size, test counts, and incident totals.
Each can prompt inquiry; none automatically establishes an intervention.
[Codebase review](../engineering/codebase-review/) supplies broader assessment
questions, while [KPIs](key-performance-indicators.md) explains the relationship
between measures, objectives, and decisions.

## Monitoring and intervention have costs of their own

Condition evidence can avoid replacing healthy components, but obtaining and
interpreting it consumes resources. DOE explicitly identifies diagnostic
equipment and training costs.[^doe-maintenance] For the software example,
additional costs could include maintaining telemetry, investigating false
alarms, and checking whether a model still applies after deployment changes.

A false alarm can cause an unnecessary restart. A missed deterioration can
leave insufficient time to protect receipt delivery. The consequences differ,
so model accuracy alone is an incomplete measure of value. Useful evidence
includes warning time, missed failures, unnecessary interventions, and the
service outcomes of the interventions actually performed.

A feedback loop also complicates interpretation: successful maintenance
prevents some predicted failures from occurring. Their absence does not
automatically prove that the prediction was wrong or that the action was
necessary. The justification needs evidence about the mechanism and the
post-intervention condition, alongside explicit uncertainty.

The [Northbank receipt records](../delivery/work-items/northbank-receipt-incident.md)
show how observations and later diagnostic evidence remain attributable without
rewriting history as if the cause were known initially. The six-hour calculation
above is a conditional numerical exhibit, not a verified forecast for that
incident. Its usefulness depends on the warning and intervention time, not
merely on producing a prediction.

## Continue reading

The [maintenance strategy comparison](maintenance-strategies.md) explains when
these evidence requirements favor a schedule, acceptance of failure, or a
change to the design. [Preventive maintenance](preventive-maintenance.md)
distinguishes recurring observation from recurring replacement.

[SLIs, SLOs, and SLAs](service-level-indicators-objectives-and-agreements.md)
connects component observations to service commitments.
[Maintenance and the life of software products](../maintenance/maintenance-and-the-life-of-software-products.md)
develops the situated understanding needed to interpret a particular product.

[^ibm-condition]: IBM, [What is condition-based maintenance?](https://www.ibm.com/think/topics/condition-based-maintenance), “CBM versus predictive maintenance” and “Vibration monitoring.”
[^doe-maintenance]: DOE, [Operations and Maintenance Best Practices Guide](https://www.energy.gov/sites/default/files/2020/04/f74/omguide_complete_w-eo-disclaimer.pdf), §5.4.
[^ibm-aging]: Castelli and colleagues, [Proactive management of software aging](https://research.ibm.com/publications/proactive-management-of-software-aging), abstract only.
[^sre-monitoring]: Google SRE, [Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/), symptoms, causes, and saturation.
