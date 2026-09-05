---
type: Checklist
title: Reliability quality criteria
description: Use when assessing whether required service remains dependable through time, demand, faults, interruption, degradation, and recovery.
tags: [codebase-review, software-quality, reliability, dependability, recovery, fault-tolerance, reporting-review]
status: draft
sources:
- id: iso-25010
  resource: https://www.iso.org/standard/78176.html
  title: ISO/IEC 25010:2023 Systems and software Quality Requirements and Evaluation — Product quality model
- id: dependability
  resource: https://www.landwehr.org/2004-aviz-laprie-randell.pdf
  title: Basic Concepts and Taxonomy of Dependable and Secure Computing
- id: sre-cascades
  resource: https://sre.google/sre-book/addressing-cascading-failures/
  title: Google SRE — Addressing Cascading Failures
- id: cwe-404
  resource: https://cwe.mitre.org/data/definitions/404.html
  title: CWE-404 Improper Resource Shutdown or Release
generated: { by: codex/gpt-5.6, at: 2026-09-01T17:48:27Z }
---

# Reliability quality criteria

Use this list to judge whether the product delivers required service with
acceptable continuity and predictability across time, demand, faults,
interruption, degradation, and recovery. Reliability claims require a defined
service, interval, conditions, and tolerance; “never fails” is not a portable
criterion. Dependability research also distinguishes desired attributes from
faults and from the means used to address them.[^dependability]

This is a candidate `reporting-review` checklist. Apply the shared assessment
states and evidence rules in [Reviewing a
codebase](../reviewing-a-codebase.md). The pillar definition and neighbor
boundaries are in [Software quality
pillars](../software-quality-pillars.md); the typed relationships below use
[Cross-cutting concerns for software quality](../cross-cutting-concerns.md).

## Default cross-cutting relationships

`XC-01` Claim context constrains every criterion through required service,
operating interval, demand, fault set, recovery bounds, and tolerance. `XC-08`
Evidence must qualify every judgment. Unless a criterion says otherwise, these
list-level defaults apply:

| Concern | Default relationship to Reliability |
| --- | --- |
| `XC-02` Specification | `EN·EV` — supplies service, continuity, fault, degradation, and recovery obligations. |
| `XC-03` Structure | `CTR` — isolation, ownership, and dependency can shape fault propagation and recovery. |
| `XC-04` Lifecycle integrity | `EN·EV·TH` — versions, configuration, releases, and recovery artifacts condition reliability. |
| `XC-05` Risk | `TH·CS·TR` — faults, demand, dependencies, and consequences determine tolerances. |
| `XC-06` Assurance | `EN·EV` — representative fault, load, interruption, and recovery evidence can support claims. |
| `XC-07` Feedback | `EN·EV` — runtime signals and incidents can reveal service behavior over time. |

## Criteria

### REL-01 — Faultlessness

**Outcome question:** Under stated normal conditions, does
product-caused failure remain within the declared tolerance over the declared
interval?[^iso-25010][^dependability]

**Why it matters:** individual success examples do not establish dependable
operation over repeated use and time.

**Applicability:** the claim needs a service definition, operating
conditions, interval, and failure tolerance. Absolute zero-failure claims
require correspondingly strong evidence.

**Boundary:** this criterion owns failure incidence over operation.
Correctness judges conformance of an individual behavior.

### REL-02 — Availability

**Outcome question:** Is required service accessible when needed
within its declared service window?[^iso-25010][^dependability]

**Why it matters:** a correct product provides no useful service when its
required capability is unavailable.

**Applicability:** availability may be scheduled, probabilistic,
scenario-bound, or limited to specific capabilities rather than continuous.

**Boundary:** this criterion owns accidental service accessibility. Security
owns adversarial denial; Safety can require deliberate unavailability.

### REL-03 — Service predictability

**Outcome question:** Does the occurrence and duration pattern of service
impairment remain within its declared variability bounds across equivalent
operating periods?[^dependability]

**Why it matters:** equivalent aggregate failure or availability can conceal
clusters and long impairment episodes that make service materially less
dependable.

**Applicability:** define the operating period, impairment event, duration, and
permitted variability. The criterion does not require identical results when
probability is accepted.

**Boundary:** `REL-01` owns aggregate failure incidence, `REL-02` owns
accessibility when needed, and this criterion owns clustering and variability
around those aggregates. Efficiency owns operation timing and resource
distributions.

### REL-04 — Load resilience

**Outcome question:** As demand approaches or exceeds declared
capacity, does service remain within its bounded overload behavior?[^sre-cascades]

**Why it matters:** unbounded queues, retry amplification, and cascading work
can turn local pressure into widespread or prolonged failure.

**Applicability:** apply where demand varies or admission is finite. The
overload range and required residual behavior must be declared.

**Boundary:** this criterion owns continuity and degradation around capacity.
Efficiency owns capacity, throughput, and cost within the intended envelope.

### REL-05 — Fault tolerance

**Outcome question:** Does the product continue delivering its required service
level when an in-scope fault occurs?[^iso-25010][^dependability]

**Why it matters:** some relevant faults must be endured rather than merely
prevented or repaired later.

**Applicability:** identify the fault set, duration, multiplicity, detection
assumptions, and required residual service. Unknown fault scope makes a broad
claim unsupported.

**Boundary:** this criterion owns continuation of the required service level
under fault. `REL-07` owns an explicitly reduced service level when full service
cannot continue; Correctness owns fault-free conformance and Safety owns harm
tolerance.

### REL-06 — Fault containment

**Outcome question:** Does an in-scope accidental failure
remain inside its declared fault boundary?[^dependability][^sre-cascades]

**Why it matters:** local failures become systemic when effects propagate
across tenants, components, regions, data, or work without bound.

**Applicability:** apply where a meaningful containment boundary exists. A
single process can still have state, resource, task, or tenant boundaries.

**Boundary:** this criterion owns accidental failure propagation. Security
isolation owns unauthorized crossing; `XC-03` Structure owns the boundary
design.

### REL-07 — Degradation

**Outcome question:** When full service cannot continue, does the
product reduce service only in its declared bounded manner?[^dependability][^sre-cascades]

**Why it matters:** prioritized, explicit loss of capability differs from
uncontrolled partial failure that gives misleading or unstable results.

**Applicability:** apply only where reduced service is acceptable and
specified. Some safety-relevant contexts legitimately require stopping.

**Boundary:** this criterion owns bounded service reduction during
impairment. Suitability owns whether the reduced capability still addresses
a need; Safety owns whether continued operation risks harm.

### REL-08 — Recoverability

**Outcome question:** After an in-scope disruption, does the product reach its
declared recovered condition within the recovery
bounds?[^iso-25010][^dependability]

**Why it matters:** interruption becomes materially worse when recovery is
incomplete, unbounded, or unable to converge.

**Applicability:** define the recovered condition through the required service,
state, recovery time, recovery point, and permitted manual dependence.

**Boundary:** this criterion owns restoration after disruption. Correctness
owns validity of restored state; Safety owns whether resumption is safe.

### REL-09 — Durability

**Outcome question:** Does acknowledged state survive every
interruption for which persistence is promised?[^dependability]

**Why it matters:** a service can appear to recover while silently losing
effects it previously represented as committed.

**Applicability:** apply only to state whose contract extends across the named
disruption and acknowledgement boundary.

**Boundary:** this criterion owns survival of promised state. Correctness
owns its content; Compatibility owns its interpretation by other versions or
systems.

### REL-10 — Resource stability

**Outcome question:** After repeated success, failure,
timeout, and cancellation cycles, does product resource use return to
sustainable bounds?[^dependability][^cwe-404]

**Why it matters:** leaked resources and orphaned work cause reliability to
decay over time even when individual operations appear acceptable.

**Applicability:** apply to resources and work with repeated or interruptible
lifecycles. One-time bounded retention may be legitimate.

**Boundary:** this criterion owns cumulative loss of service capacity.
Efficiency owns per-operation and steady-state consumption; `XC-03`
Structure owns lifecycle and ownership design.

Completion means every applicable criterion has one assessment state and a
claim-bound record under [Reviewing a codebase](../reviewing-a-codebase.md).
Several criteria refine the core ISO reliability dimensions for common stress
conditions; they are not equal-weight scores, and unsupported criteria remain
`Indeterminate` or `Not applicable` rather than assumed failures.

[^iso-25010]: ISO, [ISO/IEC 25010:2023 product quality model](https://www.iso.org/standard/78176.html).
[^dependability]: Avizienis, Laprie, Randell, and Landwehr, [Basic Concepts and Taxonomy of Dependable and Secure Computing](https://www.landwehr.org/2004-aviz-laprie-randell.pdf).
[^sre-cascades]: Google SRE, [Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/).
[^cwe-404]: MITRE, [CWE-404: Improper Resource Shutdown or Release](https://cwe.mitre.org/data/definitions/404.html).
