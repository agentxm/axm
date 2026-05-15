---
status: active
last-reviewed: 2026-04-03
version: 0.2.0
description: Error architecture, AppError conventions, typed service errors, and recovery
  operators
depends-on:
  - ./effect.md
  - ./effect-layers.md
  - ./effect-v4-quick-ref.md
---

# Effect Errors Guide

How errors work in this project: the AppError contract, when to introduce typed
service errors, recovery operators, `orDie` rules, and error channel design.

> [Error Handling Patterns](../../CLAUDE.md#error-handling-patterns) — critical
> guidance

## Key Resources

- [Effect Guide](./effect.md) — Core Effect patterns and skill index
- [Effect Option Guide](./effect-option.md) — Option versus nullable guidance
- [Effect v4 Quick Reference](./effect-v4-quick-ref.md) — Common v3 to v4
  renames
- [Effect: Error Management](https://effect.website/docs/error-management/two-error-types/) —
  Expected errors vs unexpected defects, matching, and recovery operators
- [Effect: Data.TaggedError](https://effect.website/docs/data-types/data/#taggederror) —
  API reference for tagged error classes

---

## Project Error Architecture

This project uses a two-layer error model:

- **Service layer** — services MAY use typed `Data.TaggedError` subclasses for
  internal precision where callers need distinct recovery strategies
- **CLI boundary** — command handlers MUST translate all errors to `AppError`
  before the runtime boundary

`PromptCancelled` is not an error — it is control flow for user cancellation.

```
Service layer          Handler boundary          Runtime
──────────────         ──────────────────         ─────────────────────
typed errors     →     translate to AppError  →   AppError | PromptCancelled
(when warranted)       via catchTag/mapError      rendered to stderr
```

### AppError

`AppError` is the single CLI-facing error type. It extends `Data.TaggedError`
with structured fields for rendering:

```ts
export class AppError extends Data.TaggedError("AppError")<{
  readonly code: AppErrorCode;
  readonly title: string;
  readonly detail: string;
  readonly metadata?: AppErrorMetadata;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  readonly cause: unknown;
}> {}
```

`code` is one of the twelve CLI error categories: `issues`, `usage`,
`not_found`, `auth`, `forbidden`, `conflict`, `rate_limit`, `network`,
`validation`, `internal`, `unavailable`, or `quota`. AppError exit codes are a
pure function of `code` — see
[`ExitCode`](../../packages/core/src/unstable/app-error/app-error.ts) for the
1:1 numeric mapping.

`title` is the stable summary, `detail` is the occurrence-specific message, and
`metadata.response` carries opaque RFC 9457 response data when the error came
from the registry. Do not read `error.message` for user-facing content.

All next-step guidance belongs in `suggestions`; there is no separate guidance
string.

#### Choosing a code

These pairs trip people up most often:

- **`usage` vs `validation`** — `usage` is for invocation shape: bad flags,
  missing arguments, parser errors. The Effect CLI parser produces these
  before a handler runs. `validation` is for inputs that parsed but failed
  domain rules (a malformed FQN, an out-of-range number, a registry source
  the parser accepts but the resolver rejects). Rule of thumb: if the user
  needs to fix `argv`, it is `usage`; if the user needs to fix a value, it
  is `validation`.
- **`issues` vs `internal`** — `issues` (exit 1) means the command ran
  successfully and reported problems the user needs to attend to (lint
  findings, doctor checks, compatibility warnings escalated under `--strict`).
  Reach for it when the command's job is to surface problems. `internal`
  (exit 10) means the command itself failed unexpectedly. Lint is the
  canonical user of `issues` today, but it is not lint-only — any
  "ran but found problems" outcome belongs here.
- **`auth` vs `forbidden`** — `auth` is missing/expired credentials (sign
  in again). `forbidden` is signed in but not authorized for the action
  (mirrors HTTP 401 vs 403). Different recovery, so callers care.

Use `makeAppError` for convenience construction:

```ts
const error = makeAppError({
  code: "not_found",
  detail: "Installation failed",
  recover: "Check the package name and try again",
  cause: originalError,
});
```

For one recovery step, prefer `recover` plus optional `cmd`; it prepends a
suggestion and can be combined with explicit `suggestions`:

```ts
const error = makeAppError({
  code: "not_found",
  detail: "Skill is not installed",
  recover: "List installed skills",
  cmd: "axm skills list",
});
```

### Registry HTTP errors

Registry responses use RFC 9457 Problem Details. Translate generated registry
client errors with `registryClientErrorToAppError` or `registryErrorToAppError`
from `packages/core/src/unstable/registry/translate.ts`; do not add
operation-local status-code switches. The translator maps HTTP status to the
closed `AppErrorCode` union, preserves `{ status, body }` in
`metadata.response`, and adds suggestions for retry, scope, publish lint, and
identity-mismatch details when those fields are present.

Use-case code that needs typed access to response fields defines a focused
schema next to that use case and decodes `error.metadata?.response?.body`.
Keep the body opaque in `AppErrorMetadata`; do not hoist registry-specific
fields into `AppError`.

### PromptCancelled

`PromptCancelled` signals the user cancelled a prompt (e.g., pressed Ctrl+C).
The runtime handles it by exiting with code 0 and no error output.

### Runtime boundary

`withRuntime` accepts only `Effect<A, AppError | PromptCancelled, R>`. This
constrains the error channel so all expected failures are either `AppError`
(rendered to the user) or `PromptCancelled` (silent exit). Defects crash with a
stack trace.

### Project Error Architecture Checklist

- [ ] **AppError at the boundary** — command handlers translate all errors to
      `AppError` before calling the runtime
- [ ] **Category code** — `AppError.code` is one of the twelve CLI error
      categories
- [ ] **Cause preserved** — `makeAppError` wraps the original error in `cause`
      for debugging
- [ ] **PromptCancelled for cancellation** — user cancellation uses
      `PromptCancelled`, not `AppError`

---

## When to Use Typed Service Errors

Most of the time, `AppError` with a category code plus a clear message and
suggestions is sufficient. Introduce a typed `Data.TaggedError` subclass only
when it earns its keep.

### Typed errors earn their keep when

| Signal                                                | Why a separate type helps                                                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Callers need different recovery strategies**        | `catchTag` narrows the channel — callers handle one failure without a `code` string check                                    |
| **The error carries structurally different metadata** | A `ManifestError` with `{ code, detail }` vs a `NetworkError` with `{ url, status }` — different shapes need different types |
| **Multiple services produce the error**               | A shared error type (e.g., `StorageError`) lets multiple services declare it, and callers handle it uniformly via tag        |
| **Control flow, not failure**                         | `PromptCancelled` already proves this — it needs fundamentally different handling than any `AppError`                        |

### AppError with a code is enough when

| Signal                                       | Why a new type adds no value                                                                                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Every caller recovers the same way**       | If all `catchTag("FooError")` handlers do the same thing, use a result value instead (see [Prefer result values](#prefer-result-values-over-uniform-recovery-errors)) |
| **The error is only produced in one place**  | A single `mapError` to `makeAppError` is simpler than defining + translating a typed error                                                                            |
| **The metadata fits AppError's shape**       | `code`, `title`, `detail`, `metadata`, `suggestions`, and `cause` already carry the information callers need                                                          |
| **Callers only need the category to decide** | `catchIf(e => e.code === "not_found", ...)` works without a new type                                                                                                  |

### When you introduce a typed service error

1. Define it with `Data.TaggedError` in the service's feature folder
2. Expose it in service method signatures (`E` channel)
3. Translate to `AppError` at the command handler boundary via
   `catchTag` / `mapError`
4. The runtime never sees the service error — only `AppError | PromptCancelled`

```ts
// 1. Define in the service's feature folder
export class ManifestError extends Data.TaggedError("ManifestError")<{
  readonly reason: "missing" | "invalid";
  readonly path: string;
}> {}

// 2. Expose in service signature
readonly load: (path: string) => Effect.Effect<Manifest, ManifestError>

// 3. Translate at the handler boundary
const program = manifestService.load(path).pipe(
  Effect.catchTag("ManifestError", (e) =>
    Effect.fail(
      makeAppError({
        code: "validation",
        detail: `Could not load manifest: ${e.reason}`,
        suggestions: [{ description: `Check ${e.path}` }],
        cause: e,
      })
    )
  )
);
// E = AppError — ready for the runtime
```

---

## Defining Errors with Data.TaggedError

Errors in the `E` channel must extend `Data.TaggedError`. This produces proper
`Error` subclasses with `_tag`, `name`, `message`, `stack`, and the `Yieldable`
protocol — enabling `catchTag`, structural equality, and direct yielding in
`Effect.gen`. A plain class with a manual `_tag` field compiles but produces
`[object Object]` when it escapes through `runPromise` (no stack trace, no tag
name in error reporters).

```ts
import * as Data from "effect/Data";

// Minimal — no additional fields
export class HealthKeyError extends Data.TaggedError("HealthKeyError")<{}> {}

// With fields — fields become constructor arguments
export class ManifestError extends Data.TaggedError("ManifestError")<{
  readonly reason: "missing" | "invalid";
  readonly path: string;
}> {}

// Instantiation
new HealthKeyError();
new ManifestError({ reason: "missing", path: "/app/manifest.json" });
```

### Yield errors directly — do not wrap in Effect.fail

Tagged errors implement the `Yieldable` protocol — yield them directly in
`Effect.gen` instead of wrapping in `Effect.fail` (the language service flags
this as `unnecessaryFailYieldableError`).

```ts
// WRONG — Effect.fail is redundant for yieldable errors
yield * Effect.fail(new ManifestError({ reason: "missing", path }));

// RIGHT — yield the error directly
yield * new ManifestError({ reason: "missing", path });

// RIGHT — yield AppError directly
yield *
  makeAppError({
    code: "internal",
    detail: "Installation failed",
  });
```

`Effect.fail` is still correct for non-yieldable values (plain strings, numbers,
or error types that do not extend a tagged error base).

### Do not use plain tagged classes for errors

```ts
// WRONG — not an Error subclass, no Yieldable protocol
export class HealthKeyError {
  readonly _tag = "HealthKeyError" as const;
}
```

This compiles but produces `[object Object]` when it escapes through
`runPromise` — no message, no stack trace, no tag name in error reporters.

### Name errors to inform recovery decisions

Name errors for the handler's perspective, not the originating operation. The
common mistake is tying an error to a specific operation (e.g.,
`StorageWriteError`) when it surfaces from multiple operations — a handler
catching it on a read path has to ignore the name to reason about what happened.

**Use one error type** when the failure mode, recovery strategy, and metadata
shape are the same across operations. **Split** when handlers need different
strategies per operation, metadata differs structurally, or the distinction is
needed now (not speculatively).

### Error Definition Checklist

- [ ] **Extends a tagged error base** — Error class uses
      `Data.TaggedError("TagName")<{...}>`, not a manual `_tag` field
- [ ] **Tag matches class name** — The string passed to the constructor matches
      the class name (e.g.,
      `class FooError extends Data.TaggedError("FooError")`)
- [ ] **Fields are readonly** — All fields use `readonly` modifier
- [ ] **Yield directly** — In `Effect.gen`, tagged errors are yielded directly
      (`yield* new FooError()`), not wrapped in `Effect.fail`
- [ ] **No methods** — Error classes carry data, not behavior; put logic in the
      handling site
- [ ] **Justified existence** — New error type meets the criteria in
      [When to Use Typed Service Errors](#when-to-use-typed-service-errors);
      otherwise use `AppError` with a category code

---

## Handling Errors

Choose the narrowest recovery operator that matches your intent.

### Recovery operators

| Operator                                     | Use when                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| `Effect.catchTag("Tag", handler)`            | Recovering from one specific error tag                                   |
| `Effect.catchTag(["Tag1", "Tag2"], handler)` | Recovering from several tags with a single handler                       |
| `Effect.catchTags({ Tag1: h1, Tag2: h2 })`   | Recovering from multiple tags with distinct handlers                     |
| `Effect.mapError(f)`                         | Translating an error to a different type without recovering              |
| `Effect.catch(handler)`                      | Recovering from all errors in the channel (v3: `catchAll`)               |
| `Effect.catchIf(refinement, handler)`        | Recovering when a refinement or predicate matches                        |
| `Effect.catchFilter(filter, handler)`        | Recovering using a `Filter` (v3: `catchSome`)                            |
| `Effect.catchEager(handler)`                 | Optimization variant of `catch` — applies recovery immediately (v4 only) |
| `Effect.tapError(handler)`                   | Observing errors (e.g., logging) without recovering                      |
| `Effect.tapErrorTag("Tag", handler)`         | Observing one specific error tag without recovering                      |

### Which operators apply where

With the two-layer model, different operators are natural at each layer:

| Layer                                 | Primary operators                   | Why                                                               |
| ------------------------------------- | ----------------------------------- | ----------------------------------------------------------------- |
| **Service internals** (typed errors)  | `catchTag`, `catchTags`, `mapError` | Tag-based dispatch for precise narrowing                          |
| **Handler boundary** (AppError)       | `catchTag`, `mapError`              | Translate service errors to `AppError`                            |
| **AppError discrimination** (by code) | `catchIf`                           | Match on `e.code` when multiple AppErrors need different handling |
| **External error wrapping**           | `mapError`                          | Convert infra/library errors to `AppError`                        |

```ts
// Tag-based — when service uses typed errors
manifestService
  .load(path)
  .pipe(
    Effect.catchTag("ManifestError", (e) =>
      Effect.fail(makeAppError({ code: "validation", detail: e.reason })),
    ),
  );

// Code-based — when discriminating between AppErrors
program.pipe(
  Effect.catchIf(
    (e) => e.code === "auth",
    () => Effect.fail(makeAppError({ code: "auth", detail: "Please log in" })),
  ),
);

// mapError — wrapping external errors
httpClient
  .get(url)
  .pipe(
    Effect.mapError((e) => makeAppError({ code: "network", detail: "Request failed", cause: e })),
  );
```

### Observing errors

Use `tapError` and `tapErrorTag` to log or record errors without recovering. The
error continues to propagate — these operators are purely for observation.

#### Log at the handling boundary, not at the origin

Place error logging where the error is **handled or translated**, not where it
is first produced. The handler has the richest context — which operation failed,
which request triggered it, what recovery was attempted.

```ts
// WRONG — multiple layers log the same error — duplicate noise
const getManifest = (path: string) =>
  storage.read(path).pipe(
    Effect.tapError(() => Effect.logWarning("storage read failed")),
    Effect.mapError((e) => makeAppError({ code: "not_found", detail: "Manifest not found" })),
  );

// handler logs again
getManifest(path).pipe(
  Effect.tapErrorTag("AppError", () => Effect.logWarning("manifest not found")),
  Effect.catchTag("AppError", () => Effect.succeed(fallback)),
);

// RIGHT — log once at the handling boundary
const getManifest = (path: string) =>
  storage
    .read(path)
    .pipe(
      Effect.mapError((e) => makeAppError({ code: "not_found", detail: "Manifest not found" })),
    );

// handler — single log at the point of recovery
getManifest(path).pipe(
  Effect.catchTag("AppError", (e) =>
    Effect.logWarning("manifest not found", { code: e.code }).pipe(
      Effect.andThen(Effect.succeed(fallback)),
    ),
  ),
);
```

### Cause-level and defect operators

These operators work at the `Cause` level rather than the `E` channel. Rarely
needed in application code — prefer the tag-based operators above.

| Operator                      | Use when                                                    |
| ----------------------------- | ----------------------------------------------------------- |
| `Effect.catchCause(handler)`  | Inspecting the full `Cause` structure (v3: `catchAllCause`) |
| `Effect.catchDefect(handler)` | Recovering from defects specifically (v3: `catchAllDefect`) |

### Reason-based operators (v4)

v4 introduces reason-based error handling for errors with a tagged `reason`
field. Useful when a parent error wraps variant sub-causes.

| Operator                                               | Use when                                             |
| ------------------------------------------------------ | ---------------------------------------------------- |
| `Effect.catchReason("ErrorTag", "ReasonTag", handler)` | Handling one specific reason within a tagged error   |
| `Effect.catchReasons("ErrorTag", { R1: h1, R2: h2 })`  | Handling multiple reasons within a tagged error      |
| `Effect.unwrapReason("ErrorTag")`                      | Moving reasons into `E` for handling with `catchTag` |

### Error Handling Checklist

- [ ] **Narrowest operator** — Uses `catchTag` or `catchTags` over `catch` when
      only specific errors are expected
- [ ] **Expected errors caught in pipeline** — Domain errors are handled before
      reaching the runtime boundary
- [ ] **No `orDie` on domain errors** — `Effect.orDie` is not used to silence
      expected errors for type satisfaction
- [ ] **Error channel reflects reality** — The `E` type parameter accurately
      lists errors callers must handle
- [ ] **Log at handling boundary** — Error observation (`tapError`,
      `tapErrorTag`) placed where the error is handled or translated, not at the
      origin; no duplicate logging across layers

---

## Expected vs Unexpected Errors

**Failures** — domain errors declared in `E`. Conditions callers should handle:
invalid input, missing resources, authorization rejection.

**Defects** — unexpected errors (bugs, invariant violations). Propagate as
`Cause.Die`, not part of `E`. Use `Effect.die` / `Effect.orDie` only for
conditions that genuinely indicate a bug.

### Handle expected errors before the runtime boundary

The runtime boundary accepts `AppError | PromptCancelled`. Other typed errors
must be translated to `AppError` before reaching the boundary.

```ts
// WRONG — ManifestError reaches runtime boundary and is not AppError
const program = Effect.gen(function* () {
  const manifest = yield* manifestService.load(path);
  return yield* processManifest(manifest);
});

// RIGHT — translate to AppError before the runtime boundary
const program = Effect.gen(function* () {
  const manifest = yield* manifestService.load(path);
  return yield* processManifest(manifest);
}).pipe(
  Effect.catchTag("ManifestError", (e) =>
    Effect.fail(
      makeAppError({
        code: "validation",
        detail: "Could not load manifest",
        cause: e,
      }),
    ),
  ),
);
```

### orDie — when it is and is not appropriate

Do not use `orDie` to satisfy `E = never`. It converts typed failures into
untyped defects (`Cause.Die`) — the error loses its `_tag`, typed fields, and
identity. **Handle** expected errors with `catchTag` instead.

#### When orDie is appropriate

| Scenario                                                                | Why                                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Invariant violation** — schema decode of data the code itself wrote   | Internal assumptions are broken; no caller can meaningfully recover |
| **Layer construction** — missing config, failed connection bootstrap    | Infrastructure failure before any domain operation begins           |
| **Pure infrastructure error** — where no domain error is in the channel | No caller can distinguish or recover differently                    |

#### When orDie is wrong

| Scenario                                                               | Why                                                                   |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Expected domain condition** — invalid input, auth failure, not found | Callers should handle these; `orDie` removes their ability to recover |
| **Domain errors in the channel** — `orDie` alongside domain errors     | `orDie` kills everything in `E`; domain errors become opaque defects  |

### Selective orDie — mixed error channels

When `E` contains both domain and infrastructure errors, `orDie` is too broad.
Convert only the infrastructure error to a defect:

```ts
// RIGHT — catch infrastructure error specifically — AppError stays in E
const update = (id: string) =>
  Effect.gen(function* () {
    const result = yield* doUpdate(id);
    if (!result) {
      return yield* makeAppError({
        code: "not_found",
        detail: "Resource not found",
      });
    }
    return result;
  }).pipe(Effect.catchTag("InfraError", (e) => Effect.die(e)));
// E = AppError — callers can handle it

// RIGHT — pure infrastructure — no domain errors in the channel
const findByRef = (ref: string) =>
  Effect.gen(function* () {
    const result = yield* lookup(ref);
    return result ?? null;
  }).pipe(Effect.orDie);
// E = never — only infrastructure errors were possible
```

#### Do not catchTag + re-fail before orDie

```ts
// WRONG — catchTag + re-fail + orDie is a no-op
.pipe(
  Effect.catchTag("AppError", (e) => Effect.fail(e)),
  Effect.orDie
)
// catchTag removes it from E, fail puts it back, orDie kills it anyway

// RIGHT — target the infrastructure error, not the domain error
.pipe(Effect.catchTag("InfraError", (e) => Effect.die(e)))
// E = AppError — survives for callers
```

---

## Error Channel Narrowing

Each architectural layer handles the errors meaningful to it and narrows `E` for
the layer above.

### Boundaries and their error expectations

| Boundary                | `E` expectation                     | Responsibility                                                  |
| ----------------------- | ----------------------------------- | --------------------------------------------------------------- |
| Domain / service        | Full `E` (typed errors or AppError) | Declares all errors the operation can produce                   |
| Orchestration / feature | Narrower `E`                        | Handles domain errors, translates or recovers                   |
| Command handler         | `AppError \| PromptCancelled`       | Maps all remaining errors to `AppError`                         |
| Runtime (`withRuntime`) | `AppError \| PromptCancelled`       | Renders `AppError` to stderr; silent exit for `PromptCancelled` |

### Error Channel Narrowing Checklist

- [ ] **`AppError | PromptCancelled` at runtime** — `withRuntime` accepts only
      `Effect<A, AppError | PromptCancelled, R>`
- [ ] **Handlers resolve all errors** — Command handlers translate every typed
      service error to `AppError` before calling the runtime
- [ ] **Each boundary narrows** — Layers handle errors meaningful to them rather
      than passing the full error channel through unchanged
- [ ] **No silent propagation** — Typed errors are never allowed to bypass
      `AppError` translation; only defects (bugs) should cause unhandled
      rejection

---

## Service Error Channel Design

Conventions for how services expose, handle, and translate errors.

### Expose, do not suppress

Declare domain errors in `E` — do not pre-catch internally to return
`E = never`. Callers need visibility to make recovery decisions.

```ts
// RIGHT — caller sees the error and can decide how to handle it
readonly get: (id: string) => Effect.Effect<Manifest, ManifestError>
// or with AppError:
readonly get: (id: string) => Effect.Effect<Manifest, AppError>

// WRONG — caller has no visibility into what went wrong
readonly get: (id: string) => Effect.Effect<Manifest | null>
```

### Prefer result values over uniform-recovery errors

An error belongs in `E` when callers need different recovery strategies. When
every caller recovers identically, return a result value instead.

> **Terminology note:** "Result value" in this section means returning the
> outcome as data in the success channel `A` — a `boolean`, `Option<T>`,
> discriminated union, etc. This is distinct from the `Result<A, E>` type, which
> has its own guidance in
> [Result type at boundaries](#result-type-at-boundaries).

```ts
// WRONG — every caller catches and does the same thing
export const validateKey = (
  value: string | null
): Effect.Effect<void, AppError>

// RIGHT — validation result — no error channel, no catch boilerplate
export const validateKey = (
  value: string | null
): Effect.Effect<boolean>
```

The test: if every handler does the same thing for a particular error, the
operation should probably return a result value, not a typed error.

#### Choosing a result value shape

| Scenario                                  | Return type         | Why                                                                                                                      |
| ----------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Pass/fail with no detail needed           | `boolean`           | Binary validation or authorization gates                                                                                 |
| Value may be absent (cache, lookup)       | `Option<T>`         | Effect-native; composes with `Option.match`, `Option.getOrElse`                                                          |
| Single-record lookup at data access layer | `T \| null`         | Appropriate when consumed immediately at a boundary and not threaded through an Effect pipeline                          |
| Operation outcome with metadata           | Discriminated union | When callers need to inspect _which_ outcome occurred but all recover the same way per outcome. Keep variants to 3–4 max |
| Operation that degrades gracefully        | `T` with a default  | When every caller substitutes the same fallback — return the fallback directly from the service                          |

##### When `null` is appropriate for absence

`T | null` is acceptable when all three hold: **(1)** exactly one failure mode
(absence only — if `null` could mean "not found" vs "unauthorized" vs "expired",
use `E` or a union), **(2)** consumed immediately at the call site (not threaded
through pipeline composition), and **(3)** data-access boundary
(repository/store lookup mirroring the data model).

When the value feeds into pipeline composition, prefer `Option<T>` — see
[Effect Option Guide](./effect-option.md).

### Translate at boundaries

Translate lower-level errors into the service's domain vocabulary. Use
`mapError` for direct translation, `catchTag` when translation needs side
effects (e.g., logging).

```ts
// mapError — direct translation, no side effects
const get = (id: string) =>
  StorageService.fetch(id).pipe(
    Effect.mapError((e) =>
      makeAppError({
        code: "not_found",
        detail: "Could not load manifest",
        cause: e,
      }),
    ),
  );

// catchTag — translation with side effects (e.g., logging)
const getWithLogging = (id: string) =>
  StorageService.fetch(id).pipe(
    Effect.catchTag("StorageError", (e) =>
      Effect.logWarning("Storage fetch failed").pipe(
        Effect.andThen(
          Effect.fail(
            makeAppError({
              code: "not_found",
              detail: "Could not load manifest",
              cause: e,
            }),
          ),
        ),
      ),
    ),
  );
```

### Avoid Effect.catch in services

Use `catchTag` / `catchTags` for precise narrowing. Blanket `Effect.catch`
defeats the typed channel.

### Keep error types minimal

Keep service error types focused on conditions callers can meaningfully
distinguish. Many error tags burden every handler that must resolve them.

### Convert construction errors to defects

Construction-time errors (missing config, connection failures) are
infrastructure failures. Convert with `Effect.orDie` at layer construction so
the service's runtime error channel stays focused on domain errors.

```ts
static readonly layer = Layer.effect(
  ManifestService,
  Effect.gen(function* () {
    // Construction-time dependency — failure here is an infrastructure defect
    const storage = yield* StorageService;
    return { get: (id) => /* ... */ };
  })
);
```

### Service Error Channel Design Checklist

- [ ] **Errors exposed in signatures** — Service methods declare domain errors
      in `E`, not suppress them to `never`
- [ ] **Boundary translation** — Lower-level errors translated to `AppError`
      with appropriate category codes at the handler boundary
- [ ] **No blanket catch** — `Effect.catch` not used in service methods;
      `catchTag` / `catchTags` used for precise narrowing
- [ ] **Minimal error surface** — Service error types limited to conditions
      callers can meaningfully distinguish
- [ ] **Result values over uniform-recovery errors** — If every caller handles
      an error identically, the operation returns a result value
- [ ] **Defects for invariants** — `Effect.die` reserved for broken internal
      assumptions; domain conditions use typed failures
- [ ] **Construction errors as defects** — Layer construction failures converted
      to defects with `Effect.orDie`

---

## Result Type at Boundaries

`Result<A, E>` (v4 replacement for `Either`) represents a **computed outcome** —
synchronous, pure, eagerly evaluated. `Effect<A, E, R>` represents a
**computation** — potentially async, with dependencies, lazily evaluated. Use
the least powerful abstraction that solves the problem.

### When to use Result

| Context                                       | Type                                                       | Why                                                                  |
| --------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| Pure synchronous validation or parsing        | `Result<A, E>`                                             | No effects, no dependencies — Result is sufficient                   |
| Schema decoding without Effect runtime        | `Schema.decodeResult(schema)`                              | Synchronous validation; Effect unnecessary                           |
| Encapsulating an Effect's outcome as data     | `Effect.result(e)` → `Effect<Result<A, E>, never, R>`      | Moves errors into success channel for inspection without propagation |
| Collecting all outcomes without short-circuit | `Effect.all([…], { mode: "result" })` → `Array<Result<…>>` | Every outcome captured regardless of individual failures             |

### When not to use Result

| Context                              | Use instead       | Why                                                          |
| ------------------------------------ | ----------------- | ------------------------------------------------------------ |
| Effectful computation that can fail  | `Effect<A, E, R>` | The error channel exists for this purpose                    |
| Service method return type           | `Effect<A, E, R>` | Result side-steps the error channel contract callers rely on |
| Async operation                      | `Effect<A, E, R>` | Result is synchronous; use Effect for async                  |
| Failure where callers need no detail | `Option<A>`       | Option signals absence without error context                 |

### Bridging Result into Effect

Result implements the `Yieldable` protocol — `yield*` a Result in `Effect.gen`
to extract the success value or short-circuit into Effect's error channel on
failure:

```ts
// Pure synchronous validation returning Result
const validateHandle = (input: string): Result.Result<string, HandleInvalidError> =>
  input.length === 0
    ? Result.fail(new HandleInvalidError({ reason: "empty" }))
    : Result.succeed(input.trim().toLowerCase());

// Effect pipeline — yield* the Result to bridge into the error channel
const checkHandle = (input: string) =>
  Effect.gen(function* () {
    const handle = yield* validateHandle(input); // Failure → E channel
    // ... continue with Effect operations
    return handle;
  });
```

Avoid manual unwrapping when `yield*` suffices:

```ts
// WRONG — manual check + re-yield is redundant
const result = validateHandle(input);
if (Result.isFailure(result)) {
  return yield * result.failure;
}
const handle = result.success;

// RIGHT — yield* does the same thing
const handle = yield * validateHandle(input);
```

Manual unwrapping is appropriate when you need to branch on failure details
without short-circuiting — e.g., returning a fallback response instead of
entering the error channel.

### Result Type Checklist

- [ ] **Outcomes vs computations** — Pure synchronous functions return
      `Result<A, E>`; effectful computations use Effect's error channel
- [ ] **Not in service signatures** — Service method return types use
      `Effect<A, E, R>`, not `Result<A, E>`
- [ ] **Bridge via yield\*** — Result values enter Effect pipelines through
      `yield*` in `Effect.gen`, not through manual `isFailure` checks followed
      by re-yielding the error
- [ ] **Encapsulation is intentional** — `Effect.result` and
      `{ mode: "result" }` used deliberately for outcome inspection or batch
      collection, not to avoid handling errors in `E`

---

## See Also

- [Effect Guide](./effect.md) — Core Effect patterns, service design, and skill
  index
- [Effect Option Guide](./effect-option.md) — When to use `Option` for absence
  vs typed errors
- [Effect v4 Quick Reference](./effect-v4-quick-ref.md) — `catch*` renamings
  and new v4 operators
- [TypeScript Style Guide](./typescript-style.md) — Assertion-free TypeScript
  and narrowing patterns
- [Effect: Error Management](https://effect.website/docs/error-management/two-error-types/) —
  Official error handling documentation
- [Effect: Data.TaggedError](https://effect.website/docs/data-types/data/#taggederror) —
  API reference for tagged error classes
- [Effect v4: Result module](https://github.com/Effect-TS/effect-smol/blob/main/packages/effect/src/Result.ts)
  — `Result<A, E>` API reference (v4 replacement for `Either`); JSDoc covers
  construction, transformation, pattern matching, and `Yieldable` protocol
- [Effect Solutions](https://www.effect.solutions/) — Prescriptive patterns by
  Kit Langton; covers error modeling and service architecture
