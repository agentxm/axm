---
type: Guide
title: Config
description: Centralizing typed, validated configuration; use when code reads `process.env`, repeats defaults, starts before validation, or mishandles secrets.
tags: [effect, effect-v4, config, environment, secrets, redaction, startup-validation]
status: stable
sources:
  - id: src-config
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Config.ts
    title: Config module source — descriptors, Config.schema, ConfigError, absence-only fallbacks, redacted (effect 4.0.0-rc.111)
  - id: src-config-provider
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/ConfigProvider.ts
    title: ConfigProvider module source — value sources, layer and layerAdd overrides, provider-edge naming (effect 4.0.0-rc.111)
  - id: src-schema
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Schema.ts
    title: Schema module source — SchemaError, Schema.Literals, check + makeFilter cross-field filters with per-field paths (effect 4.0.0-rc.111)
  - id: test-config
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/test/Config.test.ts
    title: Config tests — defaults apply only to wholly absent input; canonical Config.mapOrFail failure construction (effect 4.0.0-rc.111)
  - id: docs-layer-unwrap
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/ai-docs/src/01_effect/03_services/20_layer-unwrap.ts
    title: Official Effect docs — a config flag selecting between two concrete layers via Layer.unwrap (effect 4.0.0-rc.111)
  - id: docs-acquire-release
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/ai-docs/src/01_effect/05_resources/10_acquire-release.ts
    title: Official Effect docs — Config and Config.redacted yielded during Layer.effect construction (effect 4.0.0-rc.111)
  - id: applied-browser-control
    resource: https://github.com/anomalyco/browser-control/blob/0110939f584362df2cba1f4f167dc5867c7f6e27/src/session-store.ts
    title: browser-control@0110939 — shared Config descriptor consumed at construction, ConfigError mapped to a typed domain error
  - id: applied-opencode
    resource: https://github.com/anomalyco/opencode/blob/2cba7e227d68a7e7e4a2aa9c85b808e8ecb14daf/packages/opencode/src/effect/config-service.ts
    title: opencode@2cba7e2 — config-derived service with a production parse layer and a test configLayer
  - id: applied-alchemy-env
    resource: https://github.com/alchemy-run/alchemy-effect/blob/1596e503b8d0cb06463ac676defe351b8e0e131a/packages/alchemy/src/GitHub/Env.ts
    title: alchemy-effect@1596e50 — a flag whose enabled branch returns an inner Config through Config.mapOrFail, with the no-Config.flatMap rationale in-code
  - id: api-effect-v4
    resource: https://www.effect.website/docs/v4/api
    title: Effect v4 API reference — browsable Config and ConfigProvider module surfaces
    author: team:effect
    last_modified: 2026-08-17
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-config/src/SKILL.md
    title: effect-v4-config skill 0.1.0 (retired into this bundle; lineage only)
generated:
  by: codex/gpt-5.6
  at: 2026-08-24T16:00:57Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:19:06Z
  - by: claude/opus-5
    at: 2026-08-17T22:30:00Z
  - by: codex/gpt-5.6
    at: 2026-08-24T16:00:57Z
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
not configuration, [Observability](observability.md) for redaction in telemetry,
and the [Effect v4 API reference](https://www.effect.website/docs/v4/api) for
browsing the `Config` and `ConfigProvider` surfaces.

## Define meaning

- Model names, nesting, parsing, validation, optionality, and deliberate
  defaults in `Config` descriptors declared once and reused.
- Use `Config.schema` when configuration shares domain invariants or
  transformations; named constructors such as `Config.port` and
  `Config.redacted` are themselves defined through it.[^src-config]
- Give a closed set of allowed values a literal union with
  `Config.literals(literals, name?)` — the rc.111 shortcut defined as exactly
  `schema(Schema.Literals(literals), name)`. The payoff is type-level: the
  decoded value is `L[number]`, not a widened `string`, so an unlisted value
  fails at load and downstream matching stays exhaustive. Spell out
  `Config.schema(Schema.Literals([...]))` only when the set is embedded in a
  larger struct or needs a custom `Path`.[^src-config]
- Enforce rules that span settings — "flag X requires credentials Y and Z" — at
  load with `Config.mapOrFail`, so a half-configured process fails at startup
  instead of at first use. There is no `Config.flatMap`; a `Config` is itself an
  `Effect`, so the dependent branch just returns the inner
  `Config`.[^applied-alchemy-env] Its error channel is hard-typed to
  `ConfigError`, so `Effect.fail("message")` does not compile and `Effect.die`
  raises a defect rather than a config failure: construct
  `new Config.ConfigError(new Schema.SchemaError(issue))`.[^src-config][^test-config]
- Prefer `Schema.check` with `Schema.makeFilter` when the violation should
  report at a per-field path (`{ path: ["password"], issue: … }`), or several at
  once;[^src-schema] prefer `Layer.unwrap` over a branch — what official docs do
  — when the flag selects a different implementation rather than a different set
  of required settings.[^docs-layer-unwrap]
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

```ts
import { Config, Effect, Redacted, Schema, SchemaIssue } from "effect"

interface Tracing {
  readonly endpoint: string
  readonly token: Redacted.Redacted
  readonly sampleRatio: number
}

const invalid = (message: string) =>
  new Config.ConfigError(new Schema.SchemaError(new SchemaIssue.InvalidValue({ message })))

const tracing: Config.Config<Tracing | undefined> = Config.boolean("TRACING_ENABLED").pipe(
  Config.withDefault(false),
  // No Config.flatMap exists: a Config is itself an Effect, so the enabled
  // branch hands the inner Config back for mapOrFail to evaluate.
  Config.mapOrFail((enabled): Effect.Effect<Tracing | undefined, Config.ConfigError> =>
    enabled
      ? Config.all({
        endpoint: Config.string("OTLP_ENDPOINT"),
        token: Config.redacted("OTLP_TOKEN"),
        sampleRatio: Config.number("OTLP_SAMPLE_RATIO").pipe(Config.withDefault(1)),
      })
      : Effect.succeed(undefined)),
  // ConfigError is the only permitted failure here.
  Config.mapOrFail((t): Effect.Effect<Tracing | undefined, Config.ConfigError> =>
    t !== undefined && t.sampleRatio <= 0
      ? Effect.fail(invalid("OTLP_SAMPLE_RATIO must be > 0 while TRACING_ENABLED is true"))
      : Effect.succeed(t)),
)
```

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
- Closed-set settings decode to a literal union via `Config.literals`, not a
  widened `string` narrowed later.
- Rules spanning several settings are enforced at load, and their failure is a
  constructed `ConfigError` — not an `Effect.die` defect, and not a check
  deferred to first use.
- Tests override the `ConfigProvider` or the config-bearing layer, not the
  code that reads it.
- Secrets stay redacted end to end and are unwrapped once, at the consuming
  integration.
- No configuration value carries per-request or mutable domain state.

[^src-config]: `packages/effect/src/Config.ts` at `effect@4.0.0-rc.111` — `Config<T> extends Effect<T, ConfigError>`; `ConfigError` wraps `SourceError` or `Schema.SchemaError` (`:72`); `withDefault`/`option` gotchas state that validation errors and partially supplied groups still propagate; `orElse` handles all `ConfigError`s; `redacted` is `schema(Schema.Redacted(Schema.String))` (`:1498`); `mapOrFail` takes `(a: A) => Effect<B, ConfigError>` (`:289`); `literals(literals, name?)` is defined as `schema(Schema.Literals(literals), name)` (`:1295`), the shape Effect uses for its own `Config.LogLevel` (`:975`). There is no exported `Config.flatMap`. The closed-set claim rests on this first-party source alone — no `Config.literals`, `Config.literal`, or `Config.schema(Schema.Literals(…))` use appears in the surveyed applied corpus.
[^src-config-provider]: `packages/effect/src/ConfigProvider.ts` at `effect@4.0.0-rc.111` — `fromEnv`, `fromEnvRecord`, `fromDotEnv`, `fromDir`, `fromUnknown`; `ConfigProvider` is a `Context.Reference` with a `fromEnv()` default; `layer`, `layerAdd`, `mapInput`, `constantCase`, `nested`.
[^test-config]: `packages/effect/test/Config.test.ts` at `effect@4.0.0-rc.111` — "defaults wholly absent products and rejects partial products"; "validates empty env numbers when they are preserved"; "mapOrFail supports effectful validation" (`:231-252`) constructs the failure as `new Config.ConfigError(new Schema.SchemaError(new SchemaIssue.InvalidValue({ message })))`.
[^src-schema]: `packages/effect/src/Schema.ts` at `effect@4.0.0-rc.111` — `SchemaError` takes a `SchemaIssue.Issue` (`:1178`); `Schema.makeFilter` examples on `.check` return `{ path, issue }` for one field and an array of them for several (`:6546`, `:6561`).
[^docs-layer-unwrap]: `ai-docs/src/01_effect/03_services/20_layer-unwrap.ts` at `effect@4.0.0-rc.111` — `Layer.unwrap` reads `Config.boolean("MESSAGE_STORE_IN_MEMORY")` and returns one of two concrete layers (`:51-64`).
[^docs-acquire-release]: `ai-docs/src/01_effect/05_resources/10_acquire-release.ts` at `effect@4.0.0-rc.111` — `Config.string`/`Config.redacted` yielded in `Layer.effect`; `Redacted.value` unwrapped only inside the SMTP transport.
[^applied-browser-control]: Observed in browser-control@0110939 `src/session-store.ts` (effect 4.0.0-beta.97).
[^applied-opencode]: Observed in opencode@2cba7e2 `packages/opencode/src/effect/config-service.ts` (effect 4.0.0-beta.83).
[^applied-alchemy-env]: Observed in alchemy-effect@1596e50 `packages/alchemy/src/GitHub/Env.ts` (effect 4.0.0-rc.110) — `Config.boolean("GITHUB_ACTIONS")` gated over `Config.mapOrFail`, with the in-code rationale at `:30-31`: "Config has no flatMap in Effect 4; a Config is itself an Effect, so the enabled branch returns the inner config for mapOrFail to evaluate."
