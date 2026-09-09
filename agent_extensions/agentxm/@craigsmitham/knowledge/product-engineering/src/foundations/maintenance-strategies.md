---
type: Explanation
title: Maintenance strategies and their relationships
description: How failure consequences, deterioration mechanisms, evidence, lead time, and intervention cost shape a mix of run-to-failure, scheduled preventive, condition-based, and predictive maintenance for evolving software products.
tags: [maintenance, maintenance-strategies, reliability-centered-maintenance, software-aging, software-evolution, pe-foundations]
status: draft
sources:
  - id: nasa-rcm
    resource: https://www.nasa.gov/wp-content/uploads/2023/06/nasa-rcmguide.pdf
    title: NASA — Reliability-Centered Maintenance Guide for Facilities and Collateral Equipment (2008)
  - id: parnas
    resource: https://cse.msu.edu/~chengb/RE-491/Papers/software-aging-parnas.pdf
    title: David Parnas — Software Aging (1994)
  - id: ibm-aging
    resource: https://research.ibm.com/publications/proactive-management-of-software-aging
    title: Castelli and colleagues — Proactive management of software aging (2001), abstract
  - id: ibm-condition
    resource: https://www.ibm.com/think/topics/condition-based-maintenance
    title: IBM — What is condition-based maintenance?
  - id: doe-maintenance
    resource: https://www.energy.gov/sites/default/files/2020/04/f74/omguide_complete_w-eo-disclaimer.pdf
    title: DOE — Operations and Maintenance Best Practices Guide, Release 3.0 (2010)
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Maintenance strategies and their relationships

What should trigger intervention in a product that is still providing useful
service? The answer depends on what can deteriorate, the consequences of
failure, and what an intervention can accomplish. NASA's reliability-centered
maintenance approach combines maintenance choices around functions, failure
modes, and consequences.[^nasa-rcm] That makes an appropriate mix a more useful
objective than assigning one strategy to an entire product.

This explanation connects industrial maintenance concepts to evolving software.
The connection, the comparison framework, and the fictional rental-service
examples are this bundle's synthesis. The individual explainers develop
[run-to-failure](run-to-failure-maintenance.md),
[scheduled preventive maintenance](preventive-maintenance.md), and
[condition-based and predictive maintenance](condition-based-and-predictive-maintenance.md).
Here the reader can compare their assumptions and understand how they coexist.

## Software wears under use and change

Software products are malleable arrangements exposed to operating loads,
accumulating data, dependency changes, human intervention, and changing demands.
Parnas describes two forms of aging: loss of fit when a product is not adapted,
and structural deterioration caused by changes made without adequate design
understanding. He treats resource accumulation separately from those forms.
Later software-aging research, including Castelli and colleagues, explicitly
uses the term for runtime resource exhaustion.[^parnas][^ibm-aging]

These accounts support several distinct questions rather than one universal
aging curve. The following examples are illustrative:

| Force or process | What may deteriorate | What an intervention would need to address |
| --- | --- | --- |
| Repeated receipt generation retains resources | Runtime headroom and ability to finish work | Reclaim state, rejuvenate the process, or repair resource management |
| Local changes accumulate exceptions across receipt modules | Comprehensibility and ability to change behavior reliably | Recover the design understanding and revise the affected structure |
| Customers accumulate more records and request larger exports | Performance margin under the actual workload | Change data organization, processing, capacity, or the offered behavior |
| A dependency or external interface changes | Compatibility and ability to sustain the integration | Adapt, replace, or retire the affected integration |
| Knowledge of unusual customer agreements disappears | Ability to interpret and preserve intended behavior | Recover and maintain the relevant knowledge and evidence |

A restart can improve runtime condition without repairing structural
deterioration. A refactoring can make future changes safer without adding
capacity. A migration can restore compatibility while introducing unfamiliar
failure modes. Naming the force and the affected capability makes these
different intervention claims visible.

Wear therefore does not imply that every old component needs replacement, or
that every difficulty is internal degradation. Increased demand can consume
headroom in an unchanged implementation. Both deterioration and environmental
change matter to useful service, but explaining which is occurring helps
identify an effective response.

## Compare the reason for acting

Terminology varies. DOE groups predictive and condition-based maintenance
together. IBM distinguishes them and places condition-based maintenance within
a broader preventive category.[^doe-maintenance][^ibm-condition] This set uses
*scheduled preventive* for time- or use-triggered work and distinguishes a
present-condition judgment from a forecast. It does not claim a universal
taxonomy.

| Strategy | Intervention trigger | Evidence needed for the choice | Main exposure |
| --- | --- | --- | --- |
| Run-to-failure | A defined function has failed | Consequences are acceptable and recovery is credible | Failure timing and the scope of its effects |
| Scheduled preventive | An interval of time or use has elapsed | The interval tracks relevant deterioration or obligation, and the action helps | Unnecessary work, intervention defects, and failures between visits |
| Condition-based | Observed condition warrants action | A meaningful signal and enough time to intervene | Ambiguous, late, or missing signals |
| Predictive | A forecast indicates action is needed before a future limit or failure | A useful model, uncertainty assessment, and sufficient lead time | Incorrect forecasts or changed conditions invalidating the model |

The trigger is distinct from both the work performed and the date on which
that work is scheduled. Replacing a worker tomorrow because today's evidence
shows deterioration remains condition-based. Performing a weekly inspection
does not mean every inspected component is replaced weekly. Repairing a known
defect before it causes an outage can have a corrective purpose and a
preventive effect.

These strategies also differ from the software-maintenance categories that
describe the purpose of a change. Trigger, purpose, and scheduling are
separate questions; this set primarily explains the first.

## One service can justify several policies

In [Northbank Equipment](../northbank-equipment.md), durable receipt jobs can
survive a worker
crash. Waiting for an isolated worker failure might be acceptable while spare
capacity keeps receipt delivery within the promised time. That judgment says
nothing about accepting lost payment records, which have different
consequences.

For workers with a repeatable resource-accumulation pattern, periodic draining
and restarting might control disruption. If receipt sizes vary substantially,
an interval based only on elapsed time may perform poorly. Observed resource
headroom could then provide a better trigger. A forecast may add value when
replacement requires coordination well before the headroom becomes critical.

Meanwhile, scattered changes to receipt rules might warrant investigation and
structural repair. There may be no reliable scalar health threshold for that
judgment. Its evidence could be failed changes, design analysis, and the
particular obligations affected. A product need not have a numerical forecast
before its maintainers can recognize deterioration and act.

The right unit of comparison is consequently a function and its failure mode
under an operating context. “This product uses predictive maintenance” leaves
too much unstated to explain these choices.

## Maintenance changes both costs and future possibilities

Our decision framing compares recurring maintenance effort, observation and
analysis costs, disruption introduced by interventions, and the consequences
of failures that remain. These costs include people's work and lost service,
not just replacement components. Consequences that exceed an accepted boundary
can rule out a strategy even when its average cost appears low.

More observation helps only when it can change a useful decision. If an
interpretable warning arrives after an intervention could finish, better
forecasting, faster recovery, or a different design may be needed. If failure
is inconsequential, elaborate monitoring might cost more than it prevents.
If the proposed maintenance does not affect the mechanism, doing it more often
does not repair that mismatch.

Software's malleability expands the choices. Maintainers can remove a leak,
separate a dependency, change a service promise, or retire a capability. Each
can change the assumptions behind the maintenance policy. The policy therefore
needs reconsideration when the product, workload, recovery arrangement, or
consequences change.

## Connect intervention to the record and the wider system

The [Northbank receipt episode](../delivery/work-items/northbank-receipt-incident.md)
changes one baseline condition: spare capacity no longer absorbs the workload.
It separates immediate restoration, evidence about resource retention, and a
corrective Change. The [engineering-system episode](../engineering/northbank-engineering-system.md)
examines a different intervention: replacing obsolete tooling or plumbing after
its obligations are demonstrably covered. A restart, a correction, and a
replacement can each help without proving the other two were completed.

## Continue reading

Start with the individual explainer whose trigger needs examination:
[failure](run-to-failure-maintenance.md), [time and use](preventive-maintenance.md),
or [condition and forecasts](condition-based-and-predictive-maintenance.md).

[Maintenance and the life of software products](../maintenance/maintenance-and-the-life-of-software-products.md)
places intervention within care, continuity, and responsibility.
[SLIs, SLOs, and SLAs](service-level-indicators-objectives-and-agreements.md)
clarifies the service commitments against which disruption is judged.
[Drucker's organizational renewal](drucker-organizational-renewal.md) opens the
wider choice among sustaining, improving, extending, and stopping an activity.
For practical continuations, use the
[continuity and change reading route](../reading-product-engineering.md#continuity-and-change).

[^nasa-rcm]: NASA, [Reliability-Centered Maintenance Guide](https://www.nasa.gov/wp-content/uploads/2023/06/nasa-rcmguide.pdf), chapters 3–5.
[^parnas]: Parnas, [Software Aging](https://cse.msu.edu/~chengb/RE-491/Papers/software-aging-parnas.pdf), §§2–3. His distinction is preserved rather than silently equated with later runtime-aging terminology.
[^ibm-aging]: Castelli and colleagues, [Proactive management of software aging](https://research.ibm.com/publications/proactive-management-of-software-aging), abstract only.
[^ibm-condition]: IBM, [What is condition-based maintenance?](https://www.ibm.com/think/topics/condition-based-maintenance).
[^doe-maintenance]: DOE, [Operations and Maintenance Best Practices Guide](https://www.energy.gov/sites/default/files/2020/04/f74/omguide_complete_w-eo-disclaimer.pdf), §5.4.
