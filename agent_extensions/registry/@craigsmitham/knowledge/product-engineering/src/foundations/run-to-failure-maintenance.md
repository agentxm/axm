---
type: Explanation
title: "Run-to-failure maintenance: deliberate acceptance and reactive repair"
description: How run-to-failure maintenance makes functional failure the intervention trigger, when accepting that failure is defensible, and how recovery design and changing consequences affect the choice.
tags: [maintenance, breakdown-maintenance, reactive-maintenance, run-to-failure, reliability, failure-modes, pe-foundations]
status: draft
sources:
  - id: nasa-rcm
    resource: https://www.nasa.gov/wp-content/uploads/2023/06/nasa-rcmguide.pdf
    title: NASA — Reliability-Centered Maintenance Guide for Facilities and Collateral Equipment (2008)
  - id: doe-maintenance
    resource: https://www.energy.gov/sites/default/files/2020/04/f74/omguide_complete_w-eo-disclaimer.pdf
    title: DOE — Operations and Maintenance Best Practices Guide, Release 3.0 (2010)
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Run-to-failure maintenance: deliberate acceptance and reactive repair

Run-to-failure maintenance makes loss of required function the trigger for
repair or replacement. NASA also uses *reactive* and *breakdown maintenance*
for this approach, and recognizes that it can be a conscious choice when
failure consequences and prevention costs justify it.[^nasa-rcm]

This explanation examines the judgment behind that choice. Its software
applications and fictional rental-service examples are this bundle's
synthesis, rather than claims that the facilities guidance prescribes a
software operating model. The [strategy comparison](maintenance-strategies.md)
places this trigger alongside schedules, condition evidence, and forecasts.

## Failure belongs to a function and a boundary

Consider [Northbank Equipment](../northbank-equipment.md), the fictional rental
service, generating downloadable receipts.
Receipt jobs remain in durable storage until completion. A worker process can
be replaced, and replaying a job produces the same receipt without charging
the customer again. Customers may wait briefly for a receipt while another
worker takes over.

Suppose a worker accumulates runtime state until it stops processing jobs.
Waiting for that worker to fail may be acceptable if its replacement is quick,
jobs survive, and other workers provide enough capacity. The accepted failure
is specific: loss of one worker's processing function. It does not include
losing payment records or delivering incorrect receipts.

Now change one assumption. The receipt must be available immediately for a
customer to collect equipment, and there is only one worker. The same process
failure now interrupts the customer's work. A maintenance policy that was
reasonable under the first arrangement needs reconsideration under the second.

This distinction also explains why replacing a failed component can coexist
with highly reliable service. The component's maintenance trigger and the
service's continuity design operate at different boundaries. Redundancy only
helps while surviving components can actually carry the work.

## Accepting failure still requires preparation

Deliberate acceptance means understanding what will happen and being able to
recover. In the example, durable jobs, safe replay, available replacement
capacity, and detection of stalled processing make the consequences bounded.
Those capabilities require their own care. A neglected recovery path can turn
a cheap component failure into a prolonged service outage.

An unscheduled failure can therefore have a planned response. Conversely,
having an incident runbook does not establish that the original decision to
wait was sound. A team might repeatedly recover from an avoidable failure
without ever comparing that burden with prevention.

This gives a useful distinction between a maintenance strategy and a backlog
condition. “We accept this worker's failure under these circumstances” states
a policy with assumptions. “We have not had time to address it” describes
deferred work. Both can produce reactive repairs, but their reasoning and
accountability differ.

## The cost includes disruption around the repair

DOE identifies unplanned downtime, overtime, secondary damage, and inefficient
staff use as possible costs of reactive maintenance.[^doe-maintenance] In the
rental example, analogous consequences could include support conversations,
delayed collections, duplicate manual work, and interruption of planned
engineering. These are illustrative effects to investigate, not inevitable
outcomes of every worker failure.

A five-minute restart is consequently an incomplete description of recovery
cost. It omits detection time, waiting for an available maintainer, checking
the affected records, and restoring confidence in the service. An automated
restart can reduce some of that work, but a repeated restart loop may also
hide an unresolved problem.

The comparison changes again when failures correlate. If a new workload
exhausts every worker in the same way, replacing them independently may not
restore useful throughput. Evidence that failures remain isolated is part of
the justification for accepting them; it cannot be inferred merely from the
presence of multiple instances.

## Restoration and correction answer different questions

Restarting the fictional worker restores a usable runtime state. Changing its
resource management addresses the mechanism that made that state deteriorate.
The first can buy time for the second, or remain an accepted operating expense
if the consequences are sufficiently small. It does not prove that the defect
has disappeared.

Run-to-failure also does not commit a team to preserving the current design
forever. Growing repair effort, customer dependence, or loss of recovery
expertise can invalidate the original choice. Software's malleability permits
changes to the failure mechanism and to the surrounding recovery arrangements.
Those changes introduce their own costs and need verification.

The [Northbank incident example](../delivery/work-items/northbank-receipt-incident.md)
examines the changed condition where correlated workload defeats spare capacity.
The normal baseline permits delayed receipts; the immediate-collection case
above is a deliberate alternative. A recorded recovery can close an immediate
response while a defect and its corrective Change remain open.

## Continue reading

[Preventive maintenance](preventive-maintenance.md) explains intervention by
time or use when waiting for failure is too costly.
[Condition-based and predictive maintenance](condition-based-and-predictive-maintenance.md)
examines the evidence that can justify acting sooner without replacing on a
fixed schedule. The [maintenance strategy comparison](maintenance-strategies.md)
explains how these choices depend on the particular failure mode.

For the distinction between a failed service event, an underlying defect, and
the change addressing it, follow the
[software work-item taxonomy](../delivery/work-items/software-work-item-taxonomy.md).
For the meaning of the service boundary, read
[SLIs, SLOs, and SLAs](service-level-indicators-objectives-and-agreements.md).

[^nasa-rcm]: NASA, [Reliability-Centered Maintenance Guide](https://www.nasa.gov/wp-content/uploads/2023/06/nasa-rcmguide.pdf), §5.1.
[^doe-maintenance]: DOE, [Operations and Maintenance Best Practices Guide](https://www.energy.gov/sites/default/files/2020/04/f74/omguide_complete_w-eo-disclaimer.pdf), §5.2.
