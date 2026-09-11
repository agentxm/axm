# Measure record

Use for a quantitative definition and its interpretation, including service,
cost, product, or delivery measures. Apply the [common profile](../references/profile.md).
The Type contract is normative for profile 0.5.0; other sections guide authoring.

## Type contract

A Measure MUST identify:

- Meaning and decision use; subject/population, environments, dimensions,
  inclusion/exclusion rules, and scope boundaries.
- Formula, units, aggregation, counting rules, evaluation window, and relevant
  event/processing-time, timezone, or calendar semantics.
- Instrumentation/query/dataset authority and actual coverage limitations,
  separating the intended definition from available implementation.
- Interpretation, missing-data behavior, zero-denominator behavior when relevant,
  uncertainty, comparison limits, consumers, and maintenance triggers.
- Definition history needed to interpret reports across effective changes.

Event-ratio measures MUST define eligible/good events, retries, exclusions,
unknown outcomes, and zero denominators. Missing telemetry MUST NOT silently
count as success. Definitions, observed values, and target commitments MUST
remain distinguishable. Reports MUST identify the applicable definition and
period; changing a definition must not rewrite earlier assessments.

An SLI is a measure used for service quality; KPI describes decision use, not a
new type. A query link alone does not create an OKF Attested Computation.
Inline service indicators follow this contract but may inherit service ownership
and omit separate frontmatter. Common draft-gap allowances apply.

## Gather evidence

Inspect the intended decision, accepted definition, instrumentation/query source,
coverage evidence, and consuming objectives or reports. Do not infer business
meaning from a metric name alone or treat emitted samples as the full population.
Do not invent data access or execute a query merely to document it.

## Suggested record

Add supported top-level relationship fields to the frontmatter using the
[relationship forms](../references/profile.md#relationships). Omit unknown
targets and name their gaps in the body.

```markdown
---
type: Measure
title: <Quantity in reader-recognizable terms>
description: <Property, population, and distinguishing interpretation>
status: draft
---

# <Quantity in reader-recognizable terms>

## Meaning and decision use
## Subject and scope
## Definition and time semantics
## Implementation and coverage
## Interpretation and limitations
## Consumers, history, gaps, and maintenance
```

Use `owned-by` and `measures`. A measured population need not have a record per
member. Derive consumer lists from their actual references, including individual
Service objective entries. Extract a shared inline definition without leaving
another authoritative copy behind.

## Check and maintain

Can two readers compute and interpret the same quantity for the same population
and period? Review counting rules, instrumentation, dimensions, aggregation,
coverage, or consuming objective changes. Identify whether historical results
remain comparable instead of silently recomputing them under a new definition.
