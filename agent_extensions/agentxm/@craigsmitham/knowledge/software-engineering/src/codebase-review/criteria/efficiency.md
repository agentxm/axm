---
type: Checklist
title: Efficiency quality criteria
description: Use when assessing whether required behavior meets applicable time, capacity, resource, and cost constraints under representative workloads.
tags: [codebase-review, software-quality, efficiency, performance, resources, reporting-review]
status: draft
sources:
- id: iso-25010
  resource: https://www.iso.org/standard/78176.html
  title: ISO/IEC 25010:2023 Systems and software Quality Requirements and Evaluation — Product quality model
- id: iso-25010-preview
  resource: https://www.en-standard.eu/publicdoc/iec_previews/3440529.pdf
  title: ISO/IEC 25010:2023 public preview
- id: tail-scale
  resource: https://research.google/pubs/the-tail-at-scale/
  title: The Tail at Scale
- id: big-o
  resource: https://xlinux.nist.gov/dads/HTML/bigOnotation.html
  title: NIST Big-O notation
- id: unit-economics
  resource: https://www.finops.org/framework/capabilities/unit-economics/
  title: FinOps Unit Economics
generated: { by: codex/gpt-5.6, at: 2026-09-01T17:48:27Z }
---

# Efficiency quality criteria

Use this list to judge whether the product performs useful work within its
declared time, capacity, resource, and cost envelope. It is a candidate
`reporting-review` checklist: each item names a desired product outcome, not a
benchmark, profiler, optimization technique, or inspection sequence.

Apply the shared assessment states and evidence rules in
[Reviewing a codebase](../reviewing-a-codebase.md). The pillar definition and
neighbor boundaries are in [Software quality
pillars](../software-quality-pillars.md); the typed relationships below use
[Cross-cutting concerns for software quality](../cross-cutting-concerns.md).

## Default cross-cutting relationships

`XC-01` Claim context constrains every criterion, especially the workload,
platform, useful-work unit, and bound. `XC-08` Evidence must qualify every
judgment. Unless a criterion says otherwise, these list-level defaults apply:

| Concern | Default relationship to Efficiency |
| --- | --- |
| `XC-02` Specification | `EN·EV` — supplies applicable time, capacity, resource, and cost obligations. |
| `XC-03` Structure | `CTR·TR` — can reduce or create work, movement, contention, and resource tradeoffs. |
| `XC-04` Lifecycle integrity | `(EN·EV)` — can preserve comparable configurations, versions, and regression evidence. |
| `XC-05` Risk | `TH·CS·TR` — demand variation, saturation, and optimization tradeoffs condition the claim. |
| `XC-06` Assurance | `EN·EV` — analysis and representative measurements can support bounded judgments. |
| `XC-07` Feedback | `EV·TR` — observed demand and resource behavior can support claims while instrumentation has its own cost. |

## Criteria

### EFF-01 — Response time

**Outcome question:** Does each applicable interaction or
operation complete within its required elapsed-time bound under
representative conditions?[^iso-25010]

**Why it matters:** lateness can make otherwise correct behavior unusable or
unable to satisfy its operating purpose.

**Applicability:** apply where an interaction, operation, batch, startup, or
other completion time matters. Use `Indeterminate` when no defensible bound
or representative condition is available.

**Boundary:** this criterion owns elapsed-time fitness. `EFF-02` owns
variation and tail predictability; Reliability owns continuity or recovery
after a timing failure.

### EFF-02 — Timing predictability

**Outcome question:** Does the distribution of applicable
completion times remain within its declared variability and tail
tolerances?[^tail-scale]

**Why it matters:** an acceptable average can conceal rare or correlated
delays that dominate real user or system experience.

**Applicability:** apply when percentiles, deadlines, jitter, fan-out, or
variability affect the intended use. Do not invent a percentile or tolerance
merely because one is easy to measure.

**Boundary:** this criterion owns predictability of time consumption.
`EFF-01` owns the primary elapsed-time bound; Reliability owns predictable
service availability rather than timing distribution.

### EFF-03 — Throughput

**Outcome question:** Does the product sustain the required rate of
useful completed work under representative demand?[^iso-25010-preview]

**Why it matters:** fast individual operations do not establish that the
product can deliver enough useful results over time.

**Applicability:** apply when demand is expressed as requests, transactions,
records, jobs, events, or another useful-work unit. The denominator must
reflect value rather than internal activity.

**Boundary:** this criterion owns useful-work rate. `EFF-04` owns the largest
supported operating envelope, and `EFF-10` owns cost per useful unit.

### EFF-04 — Capacity

**Outcome question:** Does the product support its required operating scale
within the declared resource envelope?[^iso-25010-preview]

**Why it matters:** a product can meet latency and throughput targets at a
small scale while failing within its intended operating range.

**Applicability:** apply to current required concurrency, population, data
size, queue depth, or working-set limits. Record the relevant dimensions
rather than treating “scale” as unbounded.

**Boundary:** this criterion owns present supported capacity. Evolvability
owns the ability to change the product for materially larger future demand;
Reliability owns behavior after capacity is exceeded.

### EFF-05 — Computational proportionality

**Outcome question:** Does required computation
grow no faster than is justified by the useful result and applicable input
range?[^iso-25010-preview][^big-o]

**Why it matters:** disproportionate computational growth can make an
implementation infeasible before obvious point-in-time targets fail.

**Applicability:** apply when input size, search space, graph shape, model
size, or repetition can materially change computational work. A complexity
class alone is insufficient without relevant bounds and operations.

**Boundary:** this criterion owns growth of computational work. Structure may
contribute to that growth; `EFF-01` and `EFF-03` own observed time and rate
outcomes.

### EFF-06 — Memory economy

**Outcome question:** Does the product use memory within its
justified peak, retained, and growth bounds for representative workloads?[^iso-25010-preview]

**Why it matters:** excessive or unbounded memory use consumes finite
capacity, increases cost, and can destabilize neighboring work.

**Applicability:** apply where heap, stack, buffers, caches, mappings, or
device memory are material. Distinguish intended retention from loss of
ownership or release.

**Boundary:** this criterion owns amount and growth of memory consumption.
Reliability owns continuity and recovery when memory is unavailable;
Security owns disclosure through memory handling.

### EFF-07 — Storage economy

**Outcome question:** Does persisted and temporary storage remain
within justified volume, growth, and retention bounds?[^iso-25010-preview]

**Why it matters:** storage that grows without proportional value can exhaust
capacity, lengthen operations, and create avoidable lifecycle cost.

**Applicability:** apply to databases, indexes, logs, artifacts, caches,
snapshots, temporary data, and retained history that are part of the product
scope.

**Boundary:** this criterion owns storage consumption. Lifecycle integrity
owns retention and artifact-control capability; Correctness owns preservation
of required data.

### EFF-08 — Data-movement economy

**Outcome question:** Do data-movement volume and frequency remain within
justified bounds per useful result?[^iso-25010-preview]

**Why it matters:** unnecessary movement can dominate latency, bandwidth,
energy, and financial cost even when computation is efficient.

**Applicability:** apply across memory, process, device, storage, and network
boundaries where transfer volume or frequency is material.

**Boundary:** this criterion owns resource cost of data movement.
Compatibility owns whether exchanged representations preserve meaning;
Security owns protection of data in transit.

### EFF-09 — Processor economy

**Outcome question:** Does processor or accelerator consumption remain within
its declared peak, sustained, and per-result bounds under representative
workloads?[^iso-25010-preview]

**Why it matters:** excessive processor demand increases latency, capacity,
energy, and cost pressure even when memory and data movement remain bounded.

**Applicability:** apply to CPUs, GPUs, accelerators, or other execution
resources material to the declared workload. Concurrency and contention can
explain consumption but are not the outcome.

**Boundary:** this criterion owns execution-resource consumption. `EFF-05`
owns growth in computational work; `EFF-01` through `EFF-04` own resulting
time, rate, and capacity outcomes.

### EFF-10 — Cost proportionality

**Outcome question:** Does total resource or financial cost
remain acceptable per stable unit of useful outcome?[^unit-economics]

**Why it matters:** aggregate spend or utilization can rise for legitimate
demand, while unit cost exposes whether value and consumption remain
proportionate.

**Applicability:** apply when compute, storage, transfer, energy, licensing,
or external-service cost is a material product constraint. Use a denominator
tied to the intended outcome.

**Boundary:** this criterion owns cost per useful result. Suitability owns
whether the result is needed; `EFF-05` through `EFF-09` own particular
resource dimensions that may explain the cost.

Completion means every applicable criterion has one assessment state and a
claim-bound record under [Reviewing a codebase](../reviewing-a-codebase.md).
Completion is neither a performance certification nor evidence that every
representative workload has been exercised. These ten items are conditional
review lenses, not independent factors or additive scores.

[^iso-25010]: ISO, [ISO/IEC 25010:2023 product quality model](https://www.iso.org/standard/78176.html).
[^iso-25010-preview]: ISO/IEC, [ISO/IEC 25010:2023 public preview](https://www.en-standard.eu/publicdoc/iec_previews/3440529.pdf).
[^tail-scale]: Dean and Barroso, [The Tail at Scale](https://research.google/pubs/the-tail-at-scale/).
[^big-o]: NIST, [Big-O notation](https://xlinux.nist.gov/dads/HTML/bigOnotation.html).
[^unit-economics]: FinOps Foundation, [Unit Economics](https://www.finops.org/framework/capabilities/unit-economics/).
