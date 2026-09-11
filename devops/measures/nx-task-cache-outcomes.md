---
type: Measure
title: "Nx task-cache outcomes"
description: "Per-invocation task-cache counts and timing interpretation, distinct from dependency/archive restoration signals."
status: draft
measures:
  - ../tools/nx.md
generated:
  by: codex/gpt-6
  at: 2026-09-11T16:07:00Z
---

# Nx task-cache outcomes

## Meaning and population

Use this measure to understand reuse and execution cost within one profiled Nx
invocation, including the repository's affected and broad verification workflows.
It describes tasks represented by the emitted profile, not every requested task
or every CI job. [Nx adoption](../tools/nx.md) and the
[task-interface binding](../../docs/guides/repository-task-interface.md#cache-freshness-and-evidence)
own the surrounding evidence contract.

## Definition and implementation

[profile-nx.ts](../../scripts/profile-nx.ts) requests Nx's supported `NX_PROFILE`
trace and writes reports under `test-results/nx-cache`.
[nx-cache-profile.ts](../../scripts/nx-cache-profile.ts) owns extraction,
classification, and report schema. Each included record must be a complete
duration event (`ph: X`) with numeric duration, string status, and a project/target
identity. Events failing these conditions are omitted, not counted as success.

For each category, count the included records classified into that category:

| Category       | Classification, in precedence order                          |
| -------------- | ------------------------------------------------------------ |
| `noncacheable` | Resolved target declares `cache: false`.                     |
| `unknown`      | Target cacheability cannot be resolved.                      |
| `bypass`       | Invocation explicitly bypasses cache for a cacheable target. |
| `local-hit`    | Status is `local-cache` or `local-cache-kept-existing`.      |
| `remote-hit`   | Status is `remote-cache`.                                    |
| `skipped`      | Status is `skipped` or `stopped`.                            |
| `miss`         | Remaining included records for cacheable targets.            |

Counts have units of task records and sum to the included record count.
`eligibleTaskCount` counts records with `cacheable: true` except bypassed records;
it can include skipped records and is not an accepted hit-rate denominator.
No hit-rate objective or ratio is defined here. Do not turn zero eligible tasks
or missing telemetry into 100% reuse.

The evaluation window is one invocation's trace. There is no cross-run deduplication:
reruns/attempts are separate populations. Dimensions include repository, workflow
label, available CI revision/run/attempt/job identity, platform, project, target,
and configuration. Local runs can lack revision/run identity. Reports are not
calendar aggregates; filenames carry collection identity, not an accepted
reporting timezone or time-series bucket.

`durationMs = trace duration / 1000`. For hits, this duration also represents
reported restore duration; cache lookup time and task hashes are unavailable in
this profile. Collection overhead is measured separately after task execution.
Missing trace produces `telemetry.available: false`, an explanatory reason,
and empty counts. Such a report has no observed task population; zeros are not
evidence that no work ran. Unknown outcomes and omissions limit comparisons.

## Interpretation and history

An Actions cache archive hit is dependency/cache transport evidence, not an Nx
task hit. Replayed test output belongs to its originating execution and inputs;
restore time is not fresh test duration. Compare invocations only with their
selection, trace coverage, cache policy, substrate, and available source identity.
Do not aggregate retries as unique tasks or infer verification completeness from
cache counts. The workflow summary and report consumers are defined by the
reporting source; no operational target commitment is introduced.

This record documents report schema version 1 as inspected on 2026-09-11.
Earlier reports retain their generating implementation's meaning. Changes to
classification or extraction need an explicit comparability explanation; do not
silently reinterpret historic counts with a new definition.

## Accountability, gaps, and maintenance

Documentation maintainer: [@craigsmitham](https://github.com/craigsmitham), under
the [adoption declaration](../README.md). Repository tooling maintainers maintain instrumentation via CONTRIBUTING; an individually assigned measure owner and retained evaluation series are not documented.

Review this record when profile extraction, report schema, cache classification, timing semantics, or consuming workflows change.
