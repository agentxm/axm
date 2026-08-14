---
type: Guide
title: Observability
description: Designing coherent logs, traces, and metrics; use for scattered `console.log`, missing correlation, manual timing, or leaked secrets in telemetry.
tags: [effect, effect-v4, logging, tracing, metrics, spans, redaction, cardinality, telemetry]
status: stable
sources:
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-observability/src/SKILL.md
    title: effect-v4-observability skill 0.1.0 (retired into this bundle)
generated:
  by: claude/opus-5
  at: 2026-08-12T16:20:19Z
---

# Observability

Instrument meaningful boundaries and propagate context through the Effect.

**Applies when** code scatters `console.log`, lacks request correlation, times
operations manually, emits inconsistent telemetry, exposes secrets, or makes
production failures hard to explain — even without existing Effect
observability APIs.

**Leave alone** temporary local debugging that will not ship.

Related: [Error modeling](error-modeling.md) for logging at the handling
boundary, [Config](config.md) for redacted secrets, [Services and
layers](services-and-layers.md) for providing exporters at the application edge.

## Choose the signal

- Logs explain discrete events with structured context.
- Spans explain causal work across boundaries and time.
- Metrics explain aggregate behavior and trends.
- Use more than one only when each answers a distinct operational question.

## Keep telemetry coherent

- Add request, operation, and tenant context through scoped annotations rather than repeating fields manually.
- Create spans around service and integration boundaries, not every helper.
- Record stable operation names and outcome categories.
- Preserve typed failure and `Cause` information when setting status or logging failure.
- Let libraries emit Effect-native telemetry; configure vendor exporters at the application edge.

## Control cost and risk

- Keep metric attributes low-cardinality; never label metrics with request IDs or arbitrary user values.
- Sample or summarize high-volume events deliberately.
- Redact credentials, tokens, personal data, and sensitive configuration before telemetry leaves the process.
- Avoid recording the same failure at every layer; log where ownership or context changes.
- Test critical annotations and redaction without asserting unstable formatting.

Telemetry should support a concrete diagnosis or decision; omit noise that cannot.
