---
type: Guide
title: Runtime investigation
description: Use when a product-quality claim depends on execution, operational signals, representative workloads, degradation, interruption, or recovery.
tags: [codebase-review, review-aid, runtime, observability, measurement, operations]
status: draft
sources:
  - id: google-monitoring
    resource: https://sre.google/sre-book/monitoring-distributed-systems/
    title: Google SRE — Monitoring Distributed Systems
  - id: google-troubleshooting
    resource: https://sre.google/sre-book/effective-troubleshooting/
    title: Google SRE — Effective Troubleshooting
  - id: opentelemetry
    resource: https://opentelemetry.io/docs/concepts/signals/
    title: OpenTelemetry signals
  - id: tail-scale
    resource: https://research.google/pubs/the-tail-at-scale/
    title: The Tail at Scale
  - id: iso-15939
    resource: https://www.iso.org/standard/71197.html
    title: ISO/IEC/IEEE 15939:2017 Measurement process
generated: { by: codex/gpt-5.6, at: 2026-09-01T17:48:27Z }
---

# Runtime investigation

Use this optional aid when static repository evidence cannot establish how the
operative product behaves under relevant users, workloads, versions,
dependencies, faults, or time. Telemetry and experiments are evidence
mechanisms; observability is not a substitute for Reliability, Efficiency,
Security, Safety, or another product verdict.

## Bind execution to the claim

Record the source revision, built artifact, dependency set, configuration,
environment, data and workload class, time window, instrumentation version, and
external conditions. If those identities cannot be established, qualify the
result rather than silently attributing it to the repository.

Measurement guidance begins with an information need and a defined measurement
construct; collecting an available metric first can produce precise evidence
for the wrong question.[^iso-15939]

## Select representative observations

Choose only signals that discriminate the selected claim. Common runtime
perspectives include:

- user- or system-visible results and errors;
- demand, completion time, failure, and saturation for service behavior;
- state transitions, resource ownership, queues, retries, cancellation,
  degradation, and recovery;
- traces across relevant process, service, device, or dependency boundaries;
- logs and events with enough identity and meaning to attribute an outcome;
- profiles and resource measurements connected to useful work; and
- incident, support, and user evidence that exposes consequence.

OpenTelemetry defines traces, metrics, logs, and baggage as distinct signal
forms; collecting all of them does not establish that they are relevant,
correct, safe, or sufficiently complete for the claim.[^opentelemetry]

## Investigate without overclaiming

1. State the expected outcome, representative conditions, and material
   contrary behavior.
2. Observe a baseline before changing the system or workload.
3. Correlate the user-visible outcome with the smallest supporting set of
   runtime signals.
4. Vary one relevant dimension at a time when safe and authorized, retaining
   raw results and uncertainty.
5. Seek counterexamples, alternate causal explanations, and instrumentation
   gaps.
6. Reproduce or corroborate the result when the decision consequence warrants
   it.

Operational monitoring should emphasize consequential service behavior rather
than every available internal event, while troubleshooting should move from a
problem statement through hypotheses and tests without confusing correlation
with cause.[^google-monitoring][^google-troubleshooting]

For latency claims, preserve distributions and fan-out conditions: an
acceptable average can conceal tail behavior that dominates a large service or
interactive experience.[^tail-scale] For fault, load, or recovery experiments,
do not mutate production or consequential external state without explicit
authority and a bounded recovery plan.

## Route the outcome

Record whether the runtime result supports, contradicts, or remains
insufficient for the exact criterion. A missing signal may justify an
`Indeterminate` product verdict or a separate `XC-07` Feedback finding; it does
not automatically demonstrate the underlying product failure. Likewise, a
healthy dashboard does not prove unobserved scenarios are healthy.

Preserve the last completed observation, current system state, active
instrumentation, unfinished variation, and any external condition that may
change before resumption.

[^google-monitoring]: Google SRE, [Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/).
[^google-troubleshooting]: Google SRE, [Effective Troubleshooting](https://sre.google/sre-book/effective-troubleshooting/).
[^opentelemetry]: OpenTelemetry, [Signals](https://opentelemetry.io/docs/concepts/signals/).
[^tail-scale]: Dean and Barroso, [The Tail at Scale](https://research.google/pubs/the-tail-at-scale/).
[^iso-15939]: ISO, [ISO/IEC/IEEE 15939:2017 measurement process](https://www.iso.org/standard/71197.html).
