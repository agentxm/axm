# Connected draft example

This fictional miniature illustrates profile 0.5.0. Names, role assignments,
and targets are synthetic, not instructions for a real engineering or operations
task. Each named file below is
complete as a draft record; explicit required-information gaps are permitted
for drafts. Copy neither facts nor proposed targets into a real corpus.
The [profile](profile.md) and type contracts remain authoritative.

## `services/package-registry.md`

```markdown
---
type: Service
title: Package registry
description: Package retrieval responsibility and proposed download objective.
status: draft
---

# Package registry

## Purpose, boundary, and accountability

Supply package downloads to development teams. Publishing and account
administration are outside this record. The platform lead is the responsible
role; its contact directory is unresolved. Architecture mapping, interface
schema, dependency inventory, repository, and configuration references remain
gaps. Intended context is production; no deployed state is asserted.

## Service levels

### download-reliability

- Indicator: [Successful download ratio](../measures/download-success.md).
- Population and context: the measure's supported production download attempts.
- Target: proposed 99.9% over a rolling 28-day UTC window.
- Owner: platform lead. Rationale: a discussion starting point pending user
  needs and baseline evidence; no acceptance or effective date is established.
- Measurement: instrumentation, query, and coverage evidence are unresolved.
- Response: [Review the download objective](../runbooks/review-download-objective.md).
  Operational escalation, error-budget policy, and alerting remain gaps.

## Lifecycle and maintenance

The service is planned. No SLA is established. Review when boundary,
dependencies, operating context, ownership, telemetry, or objectives change.
The platform lead owns resolution of the listed knowledge gaps.
```

## `measures/download-success.md`

```markdown
---
type: Measure
title: Successful download ratio
description: Fraction of instrumented production downloads completed within two seconds.
status: draft
measures:
  - target: ../services/package-registry.md
    scope: Supported production client attempts
---

# Successful download ratio

## Meaning, scope, and accountability

Support the [package registry's](../services/package-registry.md) proposed
reliability objective. The platform lead owns this definition; contact-directory authority remains unresolved.
Scope is supported production clients with an instrumented download-start
event; test traffic is excluded. No additional dimensions are defined.

## Definition and interpretation

Divide good eligible attempts by all eligible attempts for the window; report
a percentage. A good attempt receives the complete artifact, passes integrity
checking, and finishes within two seconds of its start. Every retry is another
attempt. Confirmed errors, timeouts, or attempts unfinished at the deadline
are bad. Attribute each attempt to its start time in UTC and allow its deadline
to elapse before classification. Zero eligible attempts means no data.

## Implementation and limitations

Instrumentation and aggregation query are not implemented. Unreconciled
telemetry is insufficient evidence, not success or a confirmed timeout.
Attempts before the instrumented start are outside coverage. No operational
values, uncertainty estimates, or historical comparisons are available.

## Consumers, history, and maintenance

The registry's proposed objective is the initial consumer, as shown in its
objective entry. This is definition draft 1. Review when counting rules,
coverage, instrumentation, scope, or consumers change. The platform lead owns
the implementation and contact-authority gaps.
```

## `runbooks/review-download-objective.md`

```markdown
---
type: Runbook
title: Review the download objective
description: When reviewing a completed observation window, record an objective assessment or measurement gap.
status: draft
applies-to:
  - target: ../services/package-registry.md
    scope: Proposed production objective
---

# Review the download objective

## Trigger, outcome, and prerequisites

Use when asked to assess the [package registry's](../services/package-registry.md)
proposed objective for a completed window. Produce an attributable assessment
or an explicit measurement gap.
The platform lead owns the procedure; its contact directory and assessment
destination are unresolved. The reviewer needs authorized read access to the
service, measure, and eventual reporting source. No runtime changes are authorized.

## Procedure

1. Identify the objective and measure definitions and exact UTC window. Expect
   a proposed objective; stop if a different version or context is requested.
2. Locate the measure's reporting implementation and coverage evidence. If
   absent, record the missing prerequisite and stop without calculating a result.
3. Read the authorized result for the selected definition/window. Confirm
   eligibility, unknown-outcome handling, and coverage. Zero denominator means
   no data; incomplete telemetry means insufficient evidence.
4. Compare only a supported result to the proposed target, retaining source,
   definition, window, and limitations. Do not assert SLA compliance.

## Stop, recovery, and completion

Escalate inconsistent definitions or unavailable evidence to the platform lead.
Completion is a recorded assessment or measurement gap. Correct an erroneous
assessment by superseding it with a linked correction, preserving prior evidence.
There is no runtime rollback because this procedure changes no runtime state.

## Exercise history and maintenance

This draft has not been exercised. Review when the objective, measurement
implementation, assessment destination, supported context, or review process
changes. Resolve the contact and assessment-destination gaps before operational use.
```

These files would be reached through a bundle-root index and populated directory
indexes. The adoption README would declare their scope, profile version,
maintainer, and placement; neither README nor indexes own the definitions above.
