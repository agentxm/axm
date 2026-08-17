---
type: Guide
title: Config
description: Centralizing typed, validated configuration; use when code reads `process.env`, repeats defaults, starts before validation, or mishandles secrets.
tags: [effect, effect-v4, config, environment, secrets, redaction, startup-validation]
status: stable
sources:
  - id: src-config
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Config.ts
    title: Config module source — descriptors, Config.schema, ConfigError, absence-only fallbacks, redacted (effect 4.0.0-rc.110)
  - id: src-config-provider
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/ConfigProvider.ts
    title: ConfigProvider module source — value sources, layer and layerAdd overrides, provider-edge naming (effect 4.0.0-rc.110)
  - id: test-config
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/test/Config.test.ts
    title: Config tests — defaults apply only to wholly absent input (effect 4.0.0-rc.110)
  - id: docs-acquire-release
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/ai-docs/src/01_effect/05_resources/10_acquire-release.ts
    title: Official Effect docs — Config and Config.redacted yielded during Layer.effect construction (effect 4.0.0-rc.110)
  - id: applied-browser-control
    resource: https://github.com/anomalyco/browser-control/blob/0110939f584362df2cba1f4f167dc5867c7f6e27/src/session-store.ts
    title: browser-control@0110939 — shared Config descriptor consumed at construction, ConfigError mapped to a typed domain error
  - id: applied-opencode
    resource: https://github.com/anomalyco/opencode/blob/2cba7e227d68a7e7e4a2aa9c85b808e8ecb14daf/packages/opencode/src/effect/config-service.ts
    title: opencode@2cba7e2 — config-derived service with a production parse layer and a test configLayer
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-config/src/SKILL.md
    title: effect-v4-config skill 0.1.0 (retired into this bundle; lineage only)
generated:
  by: claude/fable-5
  at: 2026-08-17T14:19:06Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:19:06Z
---

# Config

Describe configuration once, validate it at composition, and inject the result.

**Applies when** code reads `process.env` directly, repeats parsing or defaults,
starts before configuration is validated, mishandles secrets, or is hard to
configure in tests — even without current Config usage.

**Leave alone** runtime business data and values that should be explicit
function inputs.

Related: [Services and layers](services-and-layers.md) for where configuration
is resolved, [Cloudflare Workers](cloudflare-workers.md) for why bindings are
not configuration, [Observability](observability.md) for redaction in telemetry.

## Define meaning

- Model names, nesting, parsing, validation, optionality, and deliberate
  defaults in `Config` descriptors declared once and reused.
- Use `Config.schema` when configuration shares domain invariants or
  transformations; named constructors such as `Config.port` and
  `Config.redacted` are themselves defined through it.[^src-config]
- Distinguish missing settings from malformed settings in diagnostics and
  policy: a `ConfigError` wraps either a source error (the provider could not
  read) or a schema error (data present but invalid).[^src-config] Where a
  caller owns the message, map it into a typed domain error naming the
  offending setting.[^applied-browser-control]
- Fallbacks cannot mask invalid input: `Config.withDefault` and `Config.option`
  apply only when relevant input is wholly absent, so malformed values and
  partially supplied groups still fail.[^test-config] Keep it that way —
  `Config.orElse` recovers from every `ConfigError`, so reserve it for genuine
  alternative sources.[^src-config]

## Set the boundary

- Keep `ConfigProvider` responsible for where values come from — env, dotenv
  files, directories, in-memory records; keep application code independent of
  environment-variable mechanics.[^src-config-provider]
- A `Config<T>` is itself an `Effect<T, ConfigError>`,[^src-config] so loading
  during layer construction is a single `yield*` and startup fails before
  application work begins.[^docs-acquire-release]
- Pass validated settings through services or layers rather than reading
  ambient state throughout the program.[^applied-opencode]
- Override the provider in tests: `ConfigProvider` is a `Context.Reference`
  with a real-environment default, so `ConfigProvider.layer` (replace) or
  `ConfigProvider.layerAdd` (compose) swaps the source without touching
  consuming code.[^src-config-provider]

```ts
import { Config, ConfigProvider, Context, Effect, Layer, Redacted } from "effect"

const port = Config.port("SMTP_PORT").pipe(Config.withDefault(587))
const pass_ = Config.redacted("SMTP_PASS")

class Mailer extends Context.Service<
  Mailer,
  { readonly send: (to: string) => Effect.Effect<void> }
>()("app/Mailer") {}

// Config<T> is an Effect<T, ConfigError>: yielding it inside Layer.effect
// loads and validates at construction, and the ConfigError surfaces in the
// layer's error channel before any application work runs.
const MailerLive = Layer.effect(
  Mailer,
  Effect.gen(function*() {
    const p = yield* port
    const key = yield* pass_
    return Mailer.of({
      // unwrap the secret only at the integration that needs it
      send: (to) => smtpSend(p, Redacted.value(key), to),
    })
  }),
)

// Tests override where values come from, not the code that uses them.
const MailerTest = MailerLive.pipe(
  Layer.provide(ConfigProvider.layer(
    ConfigProvider.fromUnknown({ SMTP_PORT: "2525", SMTP_PASS: "test-pass" }),
  )),
)
```

## Protect and evolve

- Represent secrets as redacted values (`Config.redacted`) and unwrap them with
  `Redacted.value` only at the integration that needs
  them.[^docs-acquire-release]
- Avoid logging whole configuration objects
  ([Observability](observability.md) owns redaction in telemetry).
- Keep environment-specific naming and compatibility aliases at the provider
  edge: `mapInput`, `constantCase`, `nested`, and provider-level `orElse`
  transform the provider, not application code.[^src-config-provider]
- Decide explicitly whether settings are startup snapshots or dynamically
  refreshed; ordinary config loading should not imply live reload.
- Remove obsolete settings and defaults when they stop representing supported
  behavior.

Do not use configuration as a hidden channel for per-request or mutable domain
state.

## Review checklist

- Each setting has one shared `Config` descriptor owning its name, parsing,
  optionality, and default.
- Configuration loads during layer construction; a `ConfigError` fails startup
  instead of surfacing mid-operation.
- Missing and malformed input stay distinguishable; no `Config.orElse` or
  hand-rolled fallback erases the difference.
- Tests override the `ConfigProvider` or the config-bearing layer, not the
  code that reads it.
- Secrets stay redacted end to end and are unwrapped once, at the consuming
  integration.
- No configuration value carries per-request or mutable domain state.

[^src-config]: `packages/effect/src/Config.ts` at `effect@4.0.0-rc.110` — `Config<T> extends Effect<T, ConfigError>`; `ConfigError` wraps `SourceError` or `Schema.SchemaError`; `withDefault`/`option` gotchas state that validation errors and partially supplied groups still propagate; `orElse` handles all `ConfigError`s; `redacted` is `schema(Schema.Redacted(Schema.String))`.
[^src-config-provider]: `packages/effect/src/ConfigProvider.ts` at `effect@4.0.0-rc.110` — `fromEnv`, `fromEnvRecord`, `fromDotEnv`, `fromDir`, `fromUnknown`; `ConfigProvider` is a `Context.Reference` with a `fromEnv()` default; `layer`, `layerAdd`, `mapInput`, `constantCase`, `nested`.
[^test-config]: `packages/effect/test/Config.test.ts` at `effect@4.0.0-rc.110` — "defaults wholly absent products and rejects partial products" and "validates empty env numbers when they are preserved".
[^docs-acquire-release]: `ai-docs/src/01_effect/05_resources/10_acquire-release.ts` at `effect@4.0.0-rc.110` — `Config.string`/`Config.redacted` yielded in `Layer.effect`; `Redacted.value` unwrapped only inside the SMTP transport.
[^applied-browser-control]: Observed in browser-control@0110939 `src/session-store.ts` (effect 4.0.0-beta.97).
[^applied-opencode]: Observed in opencode@2cba7e2 `packages/opencode/src/effect/config-service.ts` (effect 4.0.0-beta.83).
