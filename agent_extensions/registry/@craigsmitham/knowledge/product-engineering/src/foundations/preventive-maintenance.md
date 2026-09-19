---
type: Explanation
title: "Preventive maintenance: intervention by time and use"
description: How scheduled preventive maintenance uses elapsed time or accumulated use to trigger intervention, what makes an interval defensible, and how unnecessary work and intervention risk limit its value.
tags: [maintenance, preventive-maintenance, time-based-maintenance, scheduled-maintenance, software-rejuvenation, pe-foundations]
status: draft
sources:
  - id: doe-maintenance
    resource: https://www.energy.gov/sites/default/files/2020/04/f74/omguide_complete_w-eo-disclaimer.pdf
    title: DOE — Operations and Maintenance Best Practices Guide, Release 3.0 (2010)
  - id: nasa-rcm
    resource: https://www.nasa.gov/wp-content/uploads/2023/06/nasa-rcmguide.pdf
    title: NASA — Reliability-Centered Maintenance Guide for Facilities and Collateral Equipment (2008)
  - id: ibm-aging
    resource: https://research.ibm.com/publications/proactive-management-of-software-aging
    title: Castelli and colleagues — Proactive management of software aging (2001), abstract
  - id: postgres-vacuum
    resource: https://www.postgresql.org/docs/18/routine-vacuuming.html
    title: PostgreSQL 18 documentation — Routine Vacuuming
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Preventive maintenance: intervention by time and use

Scheduled preventive maintenance intervenes after a specified period or amount
of use, before the targeted functional failure. DOE describes it as controlling
degradation through time- or machine-run-based activity.[^doe-maintenance]
Replacing a part every three years is one example; accumulated operating hours
or cycles can provide another clock.

Here, *preventive* refers to this scheduled strategy. Other sources use the
word more broadly for work intended to prevent failure, including
condition-based work. The [strategy comparison](maintenance-strategies.md)
explains that vocabulary boundary. The software interpretations and fictional
examples below are this bundle's synthesis.

## A schedule is a claim about a mechanism

An interval makes sense when it connects an exposure, a deterioration process,
and an effective action. A date alone cannot establish that a component needs
replacement. NASA cautions that arbitrary periodic maintenance can be
ineffective or harmful when the relevant age-reliability relationship does not
support it.[^nasa-rcm]

Return to [Northbank Equipment's](../northbank-equipment.md) receipt workers.
Suppose measurement
shows that unreleased resources accumulate during receipt generation. The team
can drain a worker, restart it, and resume processing from durable jobs before
the resources reach exhaustion. Software rejuvenation research explicitly
addresses resource exhaustion and proactive restoration of runtime state;
the IBM publication abstract establishes that research scope, rather than an
interval for this example.[^ibm-aging]

A nightly restart might be a workable initial policy under a stable workload.
If receipt volume doubles, the worker may exhaust its resources before night.
A counter of processed jobs could track the relevant exposure better, provided
jobs have sufficiently similar resource effects. If large receipts dominate
the leak, even the job count may be a poor clock.

The example shows why time-based and use-based maintenance belong together
while remaining distinguishable. Each substitutes a proxy for direct
assessment of the current need. Its adequacy depends on the relationship
between that proxy and the failure mechanism.

## Predictable work has value and a price

A known maintenance window lets people arrange capacity, coordinate dependent
work, and prepare recovery. In the example, workers could be drained one at a
time while the remaining pool processes receipts. The maintenance creates
component unavailability without necessarily interrupting the service.

DOE also identifies unnecessary maintenance and damage introduced during
intervention as limitations of preventive programs.[^doe-maintenance] For the
fictional service, a restart might discard useful caches, expose a startup
defect, or reduce capacity during an unexpected demand peak. An action meant
to protect continuity can itself disturb it.

The relevant comparison includes the work induced by the schedule and the
failures that still occur between interventions. A quiet period after adopting
nightly restarts is evidence worth examining, but does not by itself establish
that the interval is efficient. Demand might also have fallen. A defensible
interpretation connects outcomes with workload, intervention history, and the
mechanism being controlled.

## Scheduled attention and scheduled replacement differ

An inspection can occur every week while replacement depends on what the
inspection finds. That combines scheduled observation with a condition-based
intervention. Treating the entire arrangement as time-based replacement would
conceal the role of judgment.

The same distinction applies to a monthly dependency review. The review gives
attention a recurring place in the team's work. An actual upgrade might be
triggered by an approaching support deadline, a compatibility problem, or a
known defect. The calendar appointment does not determine the reason for every
change performed during it.

Database upkeep makes this concrete. PostgreSQL documents recurring vacuuming
to reclaim obsolete row versions for reuse and maintain other database
properties. Its autovacuum mechanism uses thresholds, including counts of
obsolete tuples, rather than simply replacing a database at a fixed
age.[^postgres-vacuum] The example demonstrates that regular upkeep can be
necessary while its execution remains sensitive to accumulated work and state.

## Malleability changes what maintenance can accomplish

The receipt workers' restart policy resets the consequences of a resource
leak. Repairing the leak changes the future deterioration process. After that
repair, retaining the old restart interval without re-examination could
preserve disruption whose original justification has gone away.

Likewise, a new rendering library could introduce a different accumulation
pattern. Maintenance intervals are claims about a particular system under
particular conditions, so software changes can invalidate them. Refactoring
and upgrades are possible interventions, but neither is justified merely by
the age of the code. The relevant question is what deterioration the change
prevents or reverses and what new exposure it introduces.

For Northbank, a scheduled drain is an operating intervention with its own
failure and recovery conditions. It does not remove the resource-retention
mechanism or prove that the current interval remains suitable after workloads
change. The [receipt records](../delivery/work-items/northbank-receipt-incident.md)
keep restoration, diagnosis, correction, and verification distinct. Replacing
plumbing in the [engineering system](../engineering/northbank-engineering-system.md)
is a different proposal with a separate equivalence test.

## Continue reading

[Condition-based and predictive maintenance](condition-based-and-predictive-maintenance.md)
examines when observations or forecasts can replace a fixed intervention
interval. [Run-to-failure maintenance](run-to-failure-maintenance.md) explains
the alternative when failure is cheap and contained. The
[strategy comparison](maintenance-strategies.md) brings their costs and evidence
requirements together.

[Maintenance and the life of software products](../maintenance/maintenance-and-the-life-of-software-products.md)
develops the wider relationship between care, understanding, and intervention.
It helps explain why recurring attention can matter even when replacement is
unwarranted.

[^doe-maintenance]: DOE, [Operations and Maintenance Best Practices Guide](https://www.energy.gov/sites/default/files/2020/04/f74/omguide_complete_w-eo-disclaimer.pdf), §5.3.
[^nasa-rcm]: NASA, [Reliability-Centered Maintenance Guide](https://www.nasa.gov/wp-content/uploads/2023/06/nasa-rcmguide.pdf), §§5.2–5.2.2.
[^ibm-aging]: Castelli and colleagues, [Proactive management of software aging](https://research.ibm.com/publications/proactive-management-of-software-aging), abstract only.
[^postgres-vacuum]: [PostgreSQL 18, Routine Vacuuming](https://www.postgresql.org/docs/18/routine-vacuuming.html), especially §§24.1.1 and 24.1.6.
