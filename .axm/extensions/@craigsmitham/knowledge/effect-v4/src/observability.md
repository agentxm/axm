---
type: Guide
title: Observability
description: Designing coherent logs, traces, and metrics and wiring exporters at the edge; use for scattered `console.log`, missing correlation, manual timing, or leaked secrets in telemetry.
tags: [effect, effect-v4, logging, tracing, metrics, spans, span-naming, console, stdio, redaction, cardinality, telemetry, otlp, opentelemetry]
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
  - id: src-console
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Console.ts
    title: Console module source — Console.Console is a Context.Reference over the ambient console and is substitutable per fiber (effect 4.0.0-rc.110)
  - id: src-console-ref
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/internal/effect.ts
    title: Effect internals — ConsoleRef defaults to globalThis.console, and defaultLogger writes through that same reference (effect 4.0.0-rc.110)
  - id: src-stdio
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Stdio.ts
    title: Stdio module source — stdout and stderr as Sinks, stdin as a byte Stream, for byte-level and piped I/O (effect 4.0.0-rc.110)
  - id: src-cli-command
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/unstable/cli/Command.ts
    title: Unstable CLI Command source — help and errors printed through Console, with a documented silent-console substitution (effect 4.0.0-rc.110)
  - id: src-effect-span
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Effect.ts
    title: Effect module source — withSpan accepts span options as a function of the wrapped arguments; Effect.fn takes a literal name (effect 4.0.0-rc.110)
  - id: src-http-client
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/unstable/http/HttpClient.ts
    title: HttpClient source — default client span name is method-only, with the full URL carried as an attribute (effect 4.0.0-rc.110)
  - id: otel-http-spans
    resource: https://github.com/open-telemetry/semantic-conventions/blob/v1.44.0/docs/http/http-spans.md
    title: OpenTelemetry semantic conventions v1.44.0 — HTTP span names are {method} plus a low-cardinality target; instrumentation MUST NOT default to the URI path
  - id: otel-db-spans
    resource: https://github.com/open-telemetry/semantic-conventions/blob/v1.44.0/docs/db/database-spans.md
    title: OpenTelemetry semantic conventions v1.44.0 — database span names are built from low-cardinality summaries and targets, never literal query text
  - id: api-effect-v4
    resource: https://www.effect.website/docs/v4/api
    title: Effect v4 API reference — browsable Console, Logger, Stdio, Tracer, and Metric module surfaces
    author: team:effect
    last_modified: 2026-08-17
  - id: applied-alchemy-console
    resource: https://github.com/alchemy-run/alchemy-effect/blob/1596e503b8d0cb06463ac676defe351b8e0e131a/packages/alchemy/src/Cli/commands/nuke.ts
    title: alchemy-effect@1596e50 — one CLI file using both channels deliberately, with the routing rationale written in a source comment
  - id: applied-opencode-console
    resource: https://github.com/anomalyco/opencode/blob/65c35977bd564e23c0e9cf124b3e3e3b9308e9e8/packages/opencode/src/cli/cmd/github.handler.ts
    title: opencode@65c3597 — CLI output printed with raw console; the Console module is never imported anywhere in the repository (counterexample)
  - id: applied-browser-control-console
    resource: https://github.com/anomalyco/browser-control/tree/0110939f584362df2cba1f4f167dc5867c7f6e27/src
    title: browser-control@0110939 — raw console throughout; zero Effect.log* and zero Console uses (counterexample)
  - id: applied-dfx-console
    resource: https://github.com/tim-smart/dfx/tree/23988a4f182eb5cebc6c3bbac3f3c35fd303168f/src
    title: "dfx@23988a4 — control case: Effect.log* only, zero Console imports, zero raw console calls"
  - id: applied-effect-local-spans
    resource: https://github.com/lucas-barake/effect-local/blob/faa52d91faad10817906750c8cf02c71852a5521/packages/local-sql/src/ServerStore.ts
    title: effect-local@faa52d9 — literal span names with space and mutation identifiers carried as attributes
  - id: applied-opencode-spans
    resource: https://github.com/anomalyco/opencode/blob/65c35977bd564e23c0e9cf124b3e3e3b9308e9e8/packages/opencode/src/session/tools.ts
    title: opencode@65c3597 — literal Tool.execute span name with tool, call, session, and message ids as attributes
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
  - by: claude/opus-5
    at: 2026-08-17T22:05:00Z
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
layers](services-and-layers.md) for providing exporters at the application edge,
and the [Effect v4 API reference](https://www.effect.website/docs/v4/api) for
browsing the `Console`, `Logger`, `Stdio`, `Tracer`, and `Metric` surfaces.

## Choose the signal

- Logs explain discrete events with structured context.
- Spans explain causal work across boundaries and time.
- Metrics explain aggregate behavior and trends.
- Use more than one only when each answers a distinct operational question.

Text output has three destinations; choose by audience, not convenience.

- `Console.log`/`Console.error` address a person watching a terminal now — CLI
  output, prompts, progress. `Console.Console` is a `Context.Reference` whose
  default is the ambient console (`globalThis.console`; stdout/stderr on Node),
  so it is substitutable per fiber. Upstream's CLI framework prints help and
  errors through it and documents swapping in a silent console; test harnesses
  swap in a buffering one.[^src-console] [^src-cli-command]
- `Effect.log*` addresses an operator reading a stream later — it carries level,
  fiber id, log spans, and annotations, and lands wherever `Logger.layer` routes
  it.[^docs-logging]
- Raw `console.*` bypasses both references. It cannot be substituted,
  redirected, or captured in a test; reach for it only where no fiber context
  exists.
- Both Effect channels write through the *same* `ConsoleRef` by default:
  `defaultLogger` reads the fiber's console reference and picks `console.error`
  or `console.log` from `References.LogToStderr`. The runtime does not enforce
  the split — you preserve it so either channel can be rerouted independently
  later. Treat `LogToStderr` as available rather than established: zero uses
  across the reference corpus.[^src-console-ref]
- For byte-level or piped I/O — writing bytes to a pipe, consuming stdin — use
  `Stdio`, which exposes stdout and stderr as `Sink`s and stdin as a byte
  `Stream`. `Console` is not an stdout API.[^src-stdio]
- This split is a recommendation ahead of observed practice, not a community
  norm. dfx is the clean control case (`Effect.log*` only, zero `Console`, zero
  raw `console`); alchemy-effect runs both channels in one CLI file with the
  routing reason written in a source comment; opencode never imports `Console`
  and prints CLI output with raw `console`; browser-control never calls
  `Effect.log*` at all.[^applied-dfx-console] [^applied-alchemy-console]
  [^applied-opencode-console] [^applied-browser-control-console]

## Keep telemetry coherent

- Add request, operation, and tenant context through scoped annotations
  (`Effect.annotateLogs`, `Effect.annotateSpans`, `Effect.withLogSpan`) rather
  than repeating fields manually — one annotation around a unit of work covers
  every log inside it.[^docs-logging] [^applied-dfx]
- Create spans (`Effect.withSpan`, `Effect.fn` named operations) around
  service and integration boundaries, not every helper.[^docs-otlp-tracing]
- Span naming is an OpenTelemetry convention that Effect's API is shaped to
  support, not an Effect rule. OTel requires a low-cardinality name and puts
  per-call values in attributes; upstream Effect states no cardinality guidance
  anywhere, so nothing stops you interpolating an id into a
  name.[^otel-http-spans] [^otel-db-spans]
- Know the mechanism, or `Effect.fn`-shaped code reaches for interpolation:
  `Effect.withSpan` accepts span options as a **function of the wrapped
  effect's arguments**, so per-call values reach `attributes` without entering
  the name.[^src-effect-span]

  ```ts
  Effect.fnUntraced(
    function*(job: { readonly name: string }) {
      /* … */
    },
    // literal name; the per-call value lands in attributes, not the name
    Effect.withSpan("Engine.runJob", (job) => ({
      attributes: { "job.name": job.name }
    }))
  )
  ```

- Upstream's HTTP client is the model: the default client span name is
  `` `http.client ${request.method}` `` — method only — while the full URL
  leaves as the `url.full` attribute beside `server.address`, `url.path`, and
  `url.query`.[^src-http-client]
- Applied practice agrees where it was measured: effect-local names 47 spans,
  all literal, with space and mutation ids in attributes; opencode is 1105
  literal to 2 interpolated.[^applied-effect-local-spans]
  [^applied-opencode-spans]
- Record outcome categories as bounded attribute values, not as name variants.
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
- Terminal output goes through `Console`, operator telemetry through
  `Effect.log*`, and raw `console.*` appears only where no fiber context exists;
  byte-level or piped I/O uses `Stdio`.
- Correlation context flows through scoped annotations, not hand-repeated
  fields.
- Spans wrap service and integration boundaries; every span name is a literal,
  low-cardinality string, with ids, URLs, and query text supplied as attributes
  through the `withSpan` options function.
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
[^src-console]: `packages/effect/src/Console.ts` at `effect@4.0.0-rc.110` — `Console.Console` is `effect.ConsoleRef`, a `Context.Reference`; `consoleWith` reads it off the fiber, and `Console.log` writes through whatever is in scope. The module's own examples substitute a capturing console via `Effect.provideService`.
[^src-console-ref]: `packages/effect/src/internal/effect.ts` at `effect@4.0.0-rc.110` — `ConsoleRef` is declared with `defaultValue: () => globalThis.console`; `defaultLogger` then does `const console = fiber.getRef(ConsoleRef)` and selects `console.error` or `console.log` from `fiber.getRef(LogToStderr)`. Same reference, both channels.
[^src-cli-command]: `packages/effect/src/unstable/cli/Command.ts` at `effect@4.0.0-rc.110` — imports `Console` and prints help, errors, and wizard output through it; the module docs demonstrate a `silentConsole` supplied with `Effect.provideService(Console.Console, …)`.
[^src-stdio]: `packages/effect/src/Stdio.ts` at `effect@4.0.0-rc.110` — service contract for argv and standard I/O: stdout and stderr as `Sink`s accepting strings or bytes, stdin as a byte `Stream`, plus a test layer. Explicitly the alternative to writing to global process handles directly.
[^src-effect-span]: `packages/effect/src/Effect.ts` at `effect@4.0.0-rc.110` — `withSpan(name, options?, traceOptions?)` where `options` may be `SpanOptionsNoTrace | ((...args: Args) => SpanOptionsNoTrace)`; `Effect.fn` is `fn.Traced & ((name: string, options?: SpanOptionsNoTrace) => fn.Traced)`. The name is always a plain `string`; only options see the arguments. Upstream uses the options-function form in `unstable/workflow/WorkflowEngine.ts`.
[^src-http-client]: `packages/effect/src/unstable/http/HttpClient.ts` at `effect@4.0.0-rc.110` — `SpanNameGenerator` defaults to `` (request) => `http.client ${request.method}` ``; the request span sets `url.full`, `url.path`, `url.scheme`, `url.query`, `server.address`, and `server.port` as attributes.
[^otel-http-spans]: OpenTelemetry semantic conventions `v1.44.0`, `docs/http/http-spans.md` — "HTTP span names SHOULD be `{method} {target}` if there is a (low-cardinality) `target` available"; "Instrumentation MUST NOT default to using URI path as a `{target}`."
[^otel-db-spans]: OpenTelemetry semantic conventions `v1.44.0`, `docs/db/database-spans.md` — span names are built from `db.query.summary`, a low-cardinality `db.operation.name`, and a low-cardinality target; dynamic values, parameters, and literal query text do not belong in the name.
[^applied-alchemy-console]: Observed in alchemy-effect@1596e50 `packages/alchemy/src/Cli/commands/nuke.ts` (effect 4.0.0-rc.110) — `Console.log` for the user-facing "no providers match" message and `Effect.logWarning` for a per-provider scan failure in the same file, the latter with a source comment stating the reason (it must land in the stack's file logger). `packages/alchemy/src/Cli/LoggingCli.ts` routes apply progress through `Console.log` so the test runner's buffering console captures it instead of leaking to stdout.
[^applied-opencode-console]: Observed in opencode@65c3597 `packages/opencode/src/cli/cmd/github.handler.ts` (effect 4.0.0-beta.83) — CLI output via raw `console.log`. Repository-wide: 216 `Effect.log*` calls, zero `Console` module uses, ~109 raw `console` calls.
[^applied-browser-control-console]: Observed in browser-control@0110939 `src/` (effect 4.0.0-beta.97) — 19 raw `console` calls, zero `Console` imports, zero `Effect.log*`.
[^applied-dfx-console]: Observed in dfx@23988a4 `src/` (effect 4.0.0-beta.105) — 14 `Effect.log*` calls, zero `Console` imports, zero raw `console` calls. The one repository in the reference corpus that keeps the split cleanly.
[^applied-effect-local-spans]: Observed in effect-local@faa52d9 `packages/local-sql/src/ServerStore.ts` (effect 4.0.0-beta.103) — `Effect.withSpan("ServerStore.submit", { attributes: { "space.id": … } })` and siblings; `packages/local-sql/src/LocalStore.ts` names `LocalStore.mutate` with `mutation.name` and `space.id` as attributes. 47 span names, all literal.
[^applied-opencode-spans]: Observed in opencode@65c3597 `packages/opencode/src/session/tools.ts` (effect 4.0.0-beta.83) — `Effect.withSpan("Tool.execute", { attributes: { "tool.name", "tool.call_id", "session.id", "message.id" } })`. 1105 literal names against 2 interpolated repository-wide.
[^applied-effect-local]: Observed in effect-local@faa52d9 `packages/local-sql/src/internal/serverMetrics.ts` (effect 4.0.0-beta.103).
[^applied-opencode]: Observed in opencode@2cba7e2 `packages/core/src/observability/otlp.ts` (effect 4.0.0-beta.83) — edge layer built from standard `OTEL_*` environment variables.
[^applied-dfx]: Observed in dfx@23988a4 `src/DiscordGateway/Shard.ts` (effect 4.0.0-beta.105) — `Effect.annotateLogs({ package, module, shard })` around a whole scoped unit.
