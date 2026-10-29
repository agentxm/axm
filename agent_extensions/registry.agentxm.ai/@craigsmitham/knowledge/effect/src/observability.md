---
type: Checklist
title: Observability
description: Evaluate whether logs, traces, and metrics answer operational questions with coherent context, bounded cardinality, and safe lifecycle.
tags: [effect, effect-v4, logging, tracing, metrics, opentelemetry, telemetry]
status: stable
sources:
  - id: effect-logging
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/ai-docs/src/08_observability/10_logging.ts
    title: Effect 4.1.0 logging guide
  - id: effect-otlp
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/ai-docs/src/08_observability/20_otlp-tracing.ts
    title: Effect 4.1.0 OTLP tracing guide
  - id: applied-effect-local
    resource: https://github.com/lucas-barake/effect-local/blob/05e9e2515eef548c97c0480c80aa2494e21740b1/packages/local-rpc/src/SyncClient.ts
    title: effect-local operation spans at 05e9e25
  - id: effect-telemetry-changes
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/CHANGELOG.md#402
    title: Effect 4.1.0 telemetry migration changes
  - id: effect-unhandled
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/References.ts
    title: Effect 4.1.0 unhandled-error logging policy
generated: { by: codex/gpt-6, at: 2026-10-29T19:51:52Z }
---

# Observability

- [ ] Define the operational question each log, span, or metric answers before
  adding the signal.
- [ ] Use Effect logging and annotations in Effect code so levels, context,
  causes, and configured loggers remain coherent.
- [ ] Carry stable correlation fields through the Effect context instead of
  rebuilding inconsistent message strings at each call site.
- [ ] Operation spans have stable names and only useful, bounded attributes.
- [ ] Metric labels exclude unbounded or high-cardinality values.
- [ ] Record an expected failure or cause at the boundary responsible for it,
  avoiding duplicate error logs at every layer. Verify the configured
  `References.UnhandledLogLevel` preserves intended visibility of unobserved
  resource-release failures; `undefined` suppresses that logging.[^effect-unhandled]
- [ ] Redact credentials, tokens, personal data, request bodies, query
  parameters, and other sensitive values before telemetry leaves the process.
- [ ] Construct exporters and processors in edge layers and give buffering,
  flushing, and shutdown an explicit scope.
- [ ] Verify dashboards, alerts, and telemetry tests against emitted signal
  names, attributes, metric shapes, redaction, and interruption status after
  upgrades; include exporter finalization with a controlled
  backend.[^effect-telemetry-changes]

## Resources

- [Logging guide](https://github.com/Effect-TS/effect/blob/effect%404.1.0/ai-docs/src/08_observability/10_logging.ts)
- [OTLP tracing guide](https://github.com/Effect-TS/effect/blob/effect%404.1.0/ai-docs/src/08_observability/20_otlp-tracing.ts)
- [Applied operation spans in effect-local](https://github.com/lucas-barake/effect-local/blob/05e9e2515eef548c97c0480c80aa2494e21740b1/packages/local-rpc/src/SyncClient.ts)

[^effect-telemetry-changes]: [Effect telemetry migration changes](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/CHANGELOG.md#402).

[^effect-unhandled]: [Effect unhandled-error logging policy](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/References.ts).
