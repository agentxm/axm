---
status: active
last-reviewed: 2026-04-03
version: 0.2.0
description: "When choosing between Option and nullable types. Covers boundary conversions, layer parameters, and domain models."
depends-on: [./effect.md]
---

# Effect Option Guide

Guidance for choosing between `Option<T>`, `T | null`, `T | undefined`, and `T?`
(optional property) in Effect code. The goal is idiomatic Effect composability
inside pipelines while keeping interop boundaries clean. Does not cover Option
fundamentals — see the
[official Option documentation](https://effect.website/docs/data-types/option/)
for API reference and the
[Effect Code Style Guidelines](https://effect.website/docs/code-style/guidelines/)
for general conventions.

> [Effect](../../CLAUDE.md#effect) - duplicate agent copy

---

## When to Use Option

Use `Option<T>` when a value's presence or absence is a meaningful part of your
domain and you want that optionality to compose through Effect pipelines. Option
makes absence explicit at the type level and enables `map`, `flatMap`, `filter`,
and `match` chains without manual null checks
([Effect docs: Option](https://effect.website/docs/data-types/option/)).

Good fits for Option:

- **Config values that may not be set** — `Config.option()` returns `Option<T>`,
  keeping the "not configured" state visible
  ([Effect docs: Configuration](https://effect.website/docs/configuration/)).
- **Service interface fields where absence is semantic** — e.g.
  `cacheDir: Option<string>` on a cache config means "no cache directory was
  configured", distinct from any string value.
- **Return values from partial lookups** — a repository `findById` that may not
  find a record.
- **Layer parameters that toggle behavior based on presence** — e.g. a custom
  endpoint that, when absent, triggers a default or a noop path.

### Option Fitness Checklist

- [ ] **Absence is semantic** — The "not provided" case is meaningful to
      callers, not just a default-value lookup
- [ ] **Composes in Effect pipeline** — The value feeds into `map`, `flatMap`,
      `Effect.gen`, or layer/service wiring
- [ ] **No natural default** — A sensible fallback does not exist, or applying
      the fallback should be the caller's decision
- [ ] **Not a boolean flag** — The value is not a simple on/off toggle (use
      `boolean` for flags)

---

## When to Use null or undefined

Nullable types are appropriate at boundaries where Effect's Option would add
conversion noise without composability benefit.

**Use `T | null`** for domain model fields that represent "intentionally empty"
in serialized form — e.g. a database column that stores `NULL`, a JSON response
field that serializes as `null`. The
[TypeScript style guide](typescript-style.md#narrowing) already requires
optional chaining (`?.`) and nullish coalescing (`??`) for null handling.

**Use `T | undefined`** (or the `?:` optional property syntax) for:

- **Plain TypeScript function parameters with defaults** — A non-Effect factory
  function where `undefined` triggers a default value:
  `(config: RetryConfig = DEFAULT_CONFIG) => ...`
- **External API interop** — Third-party libraries and platform APIs expect
  `undefined`, not `Option.none()`. Convert at the boundary with
  `Option.getOrUndefined()`.
- **Spread-based object construction** — When building a config object for an
  external call where omitted keys should be absent from the payload, not
  `Option.none()`.

### Nullable Fitness Checklist

- [ ] **System boundary** — The value crosses into non-Effect code (JSON, DOM,
      third-party SDK, database driver)
- [ ] **Serialization fidelity** — `null` must appear in the serialized output
      (JSON, DB), not be collapsed to absence
- [ ] **Default-parameter idiom** — The function uses TypeScript's
      `= defaultValue` syntax and the optionality is a convenience, not a domain
      concept
- [ ] **No downstream Effect composition** — The nullable value is consumed
      immediately, not threaded through an Effect pipeline

---

## Converting Between Option and Nullable

Convert at the boundary between Effect-managed code and plain
TypeScript/external APIs. The
[official docs](https://effect.website/docs/data-types/option/#interop-with-nullable-types)
call these "interop" functions.

```ts
import { Option } from "effect";

// nullable → Option (entering Effect boundary)
const opt = Option.fromNullishOr(maybeName); // string | null | undefined → Option<string>

// Option → nullable (leaving Effect boundary)
const str = Option.getOrUndefined(opt); // Option<string> → string | undefined
const strOrNull = Option.getOrNull(opt); // Option<string> → string | null

// Option → default value (resolving within Effect code)
const env = Option.getOrElse(config.environment, () => "development");
```

### Boundary Conversion Checklist

- [ ] **Convert inward early** — Call `Option.fromNullishOr` at the point where
      external data enters Effect-managed code
- [ ] **Convert outward late** — Call `Option.getOrUndefined` or
      `Option.getOrNull` only at the point where data leaves for an external API
- [ ] **No round-trip in the same scope** — Do not wrap a value in
      `Option.some()` only to immediately extract it with `getOrUndefined`; that
      signals the value should stay nullable

---

## Layer and Service Parameters

Layer factory parameters are Effect's primary composition surface — callers wire
them in `Layer.mergeAll`, `Layer.provide`, and runtime builders. Using Option
here lets callers pass config fields through without intermediate
`getOrUndefined` / `isSome` extraction.

```ts
// Layer parameter uses Option — caller passes config fields directly
export interface CacheConfig {
  readonly directory: string;
  readonly environment: Option.Option<string>;
  readonly enabled: boolean; // boolean flag — not Option
  readonly endpoint: Option.Option<string>;
}

// Caller in app-runtime.ts — clean pass-through from config
makeCacheLayer({
  directory: options.cacheDir,
  environment: config.environment, // already Option from config
  enabled: Option.isSome(config.cacheEnabled),
  endpoint: config.cacheEndpoint, // already Option from config
});

// Inside the factory — resolve at the point of use
const normalizedEnv = Option.getOrElse(environment, () => "development");
```

**Boolean flags** (`enabled`, `verbose`) should be plain required `boolean`, not
`Option<boolean>`. A flag always has a known state — wrapping it in Option adds
noise. Use `Config.withDefault` to resolve flags early in the config pipeline
([Effect docs: Configuration](https://effect.website/docs/configuration/)).

**Whole-config parameters** that trigger "use all defaults" when absent are a
good fit for `Option<Config>`:

```ts
// Option<RateLimitConfig> — None means "use defaults", Some means "caller chose"
export const InMemoryRateLimitLive = (config: Option.Option<RateLimitConfig>) =>
  Layer.sync(RateLimit, () => {
    const resolved = Option.getOrElse(config, () => DEFAULT_RATE_LIMIT_CONFIG);
    return RateLimit.of({ check: makeInMemoryRateLimit(resolved).check });
  });
```

Non-Effect factory functions called _inside_ a layer can keep plain TypeScript
optional parameters. The layer factory is the Option boundary; internal helpers
below it receive resolved values.

### Layer Parameter Checklist

- [ ] **Option for pass-through config** — Parameters sourced from config Option
      fields stay as Option; do not extract early
- [ ] **Boolean for flags** — On/off toggles are required `boolean`, resolved
      via `Config.withDefault` upstream
- [ ] **Required over optional** — Prefer required parameters with explicit
      `Option.none()` at call sites over `?:` optional properties; this makes
      absence visible
- [ ] **Resolve inside the factory** — The layer factory calls
      `Option.getOrElse` or `Option.match` to resolve; callers do not need to
      know the default

---

## Domain Models and Service Interfaces

For data types that represent domain entities, the choice depends on how the
data flows.

**Use Option** when the field feeds into Effect pipelines or pattern matching:

```ts
export interface ResolvedExtension {
  readonly name: string;
  readonly description: Option.Option<string>; // feeds into rendering pipeline
}
```

**Use `T | null`** when the field is serialized to/from JSON or a database and
the null must survive round-tripping:

```ts
export interface UserSession {
  readonly email: string | null; // nullable in DB, serialized as null in JSON
  readonly sourceIp: string | null; // nullable — external origin may not supply
}
```

Avoid mixing both in the same interface. If a type straddles both worlds (Effect
pipeline + JSON serialization), use `Option` internally and convert at the
serialization boundary with `Option.getOrNull` / `Option.fromNullishOr`. The
[Schema module](https://effect.website/docs/schema/effect-data-types/) provides
`Schema.OptionFromNullishOr` for exactly this pattern.

### Domain Model Checklist

- [ ] **Consistent within interface** — All optional fields in one interface use
      the same representation (Option or nullable), not a mix
- [ ] **Matches persistence form** — Fields that map to nullable DB columns or
      JSON fields use `T | null`
- [ ] **Matches Effect pipeline** — Fields consumed in `Effect.gen`, `map`,
      `flatMap`, or service logic use `Option`
- [ ] **Schema bridge when needed** — Types that cross both boundaries use
      `Schema.OptionFromNullishOr` for conversion

---

## Config Pipeline

The `Config` module in Effect provides built-in Option support. The pattern in
this project: `Config.option()` for genuinely optional values,
`Config.withDefault()` for values with known defaults.

```ts
// Config.option → Option<string> in config data
environment: Config.option(Config.string("DEPLOY_ENVIRONMENT")),

// Config.withDefault → plain boolean in config data
verbose: Config.withDefault(Config.boolean("VERBOSE"), false),
```

Do not use `Config.option` and then immediately `Option.getOrElse` in the same
config builder — use `Config.withDefault` instead. Reserve `Option` for values
where downstream code branches on presence vs absence.

### Config Checklist

- [ ] **`Config.option` for genuinely optional** — The field's absence changes
      behavior (e.g. disabling a feature, selecting a noop implementation)
- [ ] **`Config.withDefault` for defaulted** — The field has a sensible
      fallback; downstream code always receives a concrete value
- [ ] **No immediate unwrap** — If you extract the Option in the same function
      that creates it, use `Config.withDefault` instead

---

## Quick Reference

| Situation                      | Use                                | Why                                      |
| ------------------------------ | ---------------------------------- | ---------------------------------------- |
| Config field, no default       | `Option<T>`                        | Downstream decides how to handle absence |
| Config field, has default      | plain `T` via `Config.withDefault` | Resolved early, simpler downstream       |
| Layer parameter from config    | `Option<T>` (pass through)         | Avoids premature extraction              |
| Layer parameter, boolean flag  | `boolean` (required)               | Flags are always known                   |
| Internal factory below layer   | `T?` or `T = default`              | Plain TS; layer already resolved         |
| Domain field, DB/JSON nullable | `T \| null`                        | Matches serialized form                  |
| Domain field, Effect pipeline  | `Option<T>`                        | Composes with map/flatMap                |
| External API / 3rd-party SDK   | `T \| undefined`                   | Matches JS conventions                   |
| Schema crossing both worlds    | `Schema.OptionFromNullishOr`       | Converts at boundary                     |

---

## Sources

- [Effect: Option](https://effect.website/docs/data-types/option/) — Official
  Option API, patterns, and interop with nullable types
- [Effect: Configuration](https://effect.website/docs/configuration/) —
  `Config.option`, `Config.withDefault`, and config pipeline patterns
- [Effect: Code Style Guidelines](https://effect.website/docs/code-style/guidelines/)
  — General idiomatic Effect conventions
- [Effect: Schema Effect Data Types](https://effect.website/docs/schema/effect-data-types/)
  — `Schema.OptionFromNullishOr` and related Schema-Option bridges
- [Effect Solutions](https://www.effect.solutions/) — Prescriptive patterns by
  Kit Langton; covers config, testing, and service architecture
- [EffectPatterns](https://github.com/PaulJPhilp/EffectPatterns) —
  Community-driven practical patterns

---

## See Also

- [Effect Guide](./effect.md) - Broader Effect patterns
- [Effect v4 Quick Reference](./effect-v4-quick-ref.md) - Related API changes
- [TypeScript Style Guide](./typescript-style.md) - Null handling and narrowing
