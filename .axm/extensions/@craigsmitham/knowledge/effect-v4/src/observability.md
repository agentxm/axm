---
type: Guide
title: Observability
description: Designing coherent logs, traces, and metrics and wiring exporters at the edge; use for scattered `console.log`, missing correlation, manual timing, or leaked secrets in telemetry.
tags: [effect, effect-v4, logging, tracing, metrics, spans, redaction, cardinality, telemetry, otlp]
status: stable
sources:
  - id: docs-logging
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/ai-docs/src/08_observability/10_logging.ts
    title: Official Effect docs — Logger.layer composition, MinimumLogLevel filtering, log annotations (effect 4.0.0-rc.110)
  - id: docs-otlp-tracing
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/ai-docs/src/08_observability/20_otlp-tracing.ts
    title: Official Effect docs — spans at boundaries and the Otlp exporter layer provided last (effect 4.0.0-rc.110)
  - id: src-metric
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Metric.ts
    title: Metric module source — attribute options and withAttributes (effect 4.0.0-rc.110)
  - id: src-tracer
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Tracer.ts
    title: Tracer module source — Ended span status carries the full Exit (effect 4.0.0-rc.110)
  - id: src-formatter
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Formatter.ts
    title: Formatter module source — automatic redaction of Redactable values in formatted output (effect 4.0.0-rc.110)
  - id: applied-effect-local
    resource: https://github.com/lucas-barake/effect-local/blob/faa52d91faad10817906750c8cf02c71852a5521/packages/local-sql/src/internal/serverMetrics.ts
    title: effect-local@faa52d9 — metrics labeled only with bounded outcome enums
  - id: applied-opencode
    resource: https://github.com/anomalyco/opencode/blob/2cba7e227d68a7e7e4a2aa9c85b808e8ecb14daf/packages/core/src/observability/otlp.ts
    title: opencode@2cba7e2 — OTLP export assembled once at the application edge
  - id: applied-dfx
    resource: https://github.com/tim-smart/dfx/blob/23988a4f182eb5cebc6c3bbac3f3c35fd303168f/src/DiscordGateway/Shard.ts
    title: dfx@23988a4 — one scoped annotateLogs wrapping a whole unit of work
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-observability/src/SKILL.md
    title: effect-v4-observability skill 0.1.0 (retired into this bundle; lineage only)
generated:
  by: claude/fable-5
  at: 2026-08-17T14:19:49Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:19:49Z
---

# Observability

Instrument meaningful boundaries and propagate context through the Effect.

**Applies when** code scatters `console.log`, lacks request correlation, times
operations manually, emits inconsistent telemetry, exposes secrets, or makes
production failures hard to explain — even without existing Effect
observability APIs.

**Leave alone** temporary local debugging that will not ship.

Related: [Error modeling](error-modeling.md) for deciding where failure is
handled, [Config](config.md) for redacted secrets, [Services and
layers](services-and-layers.md) for providing exporters at the application edge.

## Choose the signal

- Logs explain discrete events with structured context.
- Spans explain causal work across boundaries and time.
- Metrics explain aggregate behavior and trends.
- Use more than one only when each answers a distinct operational question.

## Keep telemetry coherent

- Add request, operation, and tenant context through scoped annotations
  (`Effect.annotateLogs`, `Effect.annotateSpans`, `Effect.withLogSpan`) rather
  than repeating fields manually — one annotation around a unit of work covers
  every log inside it.[^docs-logging] [^applied-dfx]
- Create spans (`Effect.withSpan`, `Effect.fn` named operations) around
  service and integration boundaries, not every helper.[^docs-otlp-tracing]
- Record stable operation names and outcome categories.
- Preserve typed failure and `Cause` information when setting status or
  logging failure; a span's ended status carries the full `Exit`.[^src-tracer]
- Let libraries emit Effect-native telemetry; configure vendor exporters at the application edge.

## Wire the edge

- Compose loggers with `Logger.layer` (`Logger.consoleJson`, `Logger.toFile`,
  `Logger.batched`) and filter levels by providing
  `References.MinimumLogLevel`.[^docs-logging]
- Export OTLP telemetry with the `OtlpTracer`/`OtlpLogger`/`OtlpMetrics`
  layers, which require an `OtlpSerialization` layer and an `HttpClient` —
  or use `@effect/opentelemetry` (`NodeSdk`, `WebSdk`) when an OpenTelemetry
  SDK pipeline is required.[^docs-otlp-tracing]
- Provide the exporter layer last in the layer graph so everything the
  application emits is exported; assemble it once, at the edge, from
  deployment configuration.[^docs-otlp-tracing] [^applied-opencode]
- The `Otlp*` family lives under `effect/unstable/observability` at rc.110;
  expect higher churn than core modules and re-verify names against the
  installed version.

## Control cost and risk

- Keep metric attributes low-cardinality — bounded outcome enums, never
  request IDs or arbitrary user values.[^src-metric] [^applied-effect-local]
- Sample or summarize high-volume events deliberately.
- Redact credentials, tokens, personal data, and sensitive configuration
  before telemetry leaves the process; `Redacted` values are automatically
  redacted in formatted log output.[^src-formatter]
- Log a failure once, at the boundary where ownership or context changes and
  disposition is decided; do not record the same failure at every propagation
  layer. [Error modeling](error-modeling.md) owns deciding where failure is
  handled.
- Test critical annotations and redaction without asserting unstable formatting.

Telemetry should support a concrete diagnosis or decision; omit noise that cannot.

## Review checklist

- Each emitted signal answers a distinct operational question.
- Correlation context flows through scoped annotations, not hand-repeated
  fields.
- Spans wrap service and integration boundaries with stable operation names.
- Metric attributes are bounded; failures are logged once, with `Cause`, where
  ownership changes.
- Secrets pass through `Redacted` values and never reach an exporter in clear
  text.
- Loggers, level filtering, and exporters are provided once, last, at the
  application edge.

[^docs-logging]: `ai-docs/src/08_observability/10_logging.ts` at `effect@4.0.0-rc.110` — `Logger.layer`, `Logger.consoleJson`/`toFile`/`batched`, `References.MinimumLogLevel`, `Effect.annotateLogs`, `Effect.withLogSpan`.
[^docs-otlp-tracing]: `ai-docs/src/08_observability/20_otlp-tracing.ts` at `effect@4.0.0-rc.110` — `Effect.withSpan`/`annotateSpans`, `Effect.fn` named operations, `OtlpTracer`/`OtlpLogger` + `OtlpSerialization.layerJson` + `FetchHttpClient.layer`, observability layer provided last; module family at `packages/effect/src/unstable/observability/`.
[^src-metric]: `packages/effect/src/Metric.ts` at `effect@4.0.0-rc.110` — attribute options on metric constructors and `Metric.withAttributes`.
[^src-tracer]: `packages/effect/src/Tracer.ts` at `effect@4.0.0-rc.110` — the `Ended` span status records `exit: Exit<unknown, unknown>`.
[^src-formatter]: `packages/effect/src/Formatter.ts` at `effect@4.0.0-rc.110` — formatting redacts `Redacted`/`Redactable` values in log and inspection output.
[^applied-effect-local]: Observed in effect-local@faa52d9 `packages/local-sql/src/internal/serverMetrics.ts` (effect 4.0.0-beta.103).
[^applied-opencode]: Observed in opencode@2cba7e2 `packages/core/src/observability/otlp.ts` (effect 4.0.0-beta.83) — edge layer built from standard `OTEL_*` environment variables.
[^applied-dfx]: Observed in dfx@23988a4 `src/DiscordGateway/Shard.ts` (effect 4.0.0-beta.105) — `Effect.annotateLogs({ package, module, shard })` around a whole scoped unit.
