---
status: active
last-reviewed: 2026-04-03
version: 0.1.0
description: "When adding logging or diagnostics. Covers structured logging with Effect, log levels, and spans."
depends-on:
  - ./effect.md
---

# Logging Guide

How to emit structured logs in CLI code using Effect log functions, choose the
right log level, and annotate logs with searchable context. After reading, you
should know when to use `Effect.log*` versus `Console`, how to annotate logs,
and where to log errors.

**Not covered:** Log routing internals, platform layer configuration, or
observability infrastructure.

---

## Effect log functions

All application logging uses Effect's built-in log functions. In the CLI these
are rendered to stderr so they never interfere with machine-readable stdout
output.

### Basic usage

```typescript
import { Effect } from "effect";

Effect.gen(function* () {
  yield* Effect.logDebug("cache miss", { key });
  yield* Effect.logInfo("extension installed");
  yield* Effect.logWarning("rate limit approaching", { remaining });
  yield* Effect.logError("manifest fetch failed", { extensionId });
});
```

`Effect.log*` functions accept a message and optional annotations. Annotations
are included as structured fields in the log record.

### Log levels

| Function            | When to use                                   |
| ------------------- | --------------------------------------------- |
| `Effect.logDebug`   | Detailed diagnostic info, off by default      |
| `Effect.logInfo`    | Normal operational events (installed, synced) |
| `Effect.logWarning` | Degraded but recoverable situations           |
| `Effect.logError`   | Genuine failures that need attention          |
| `Effect.logFatal`   | Unrecoverable failures, CLI cannot continue   |

In the CLI, `--verbose` (or equivalent) enables `Debug`-level output. Default
runs show `Info` and above.

### Be intentional with logError

Reserve `Effect.logError` for genuine failures — not expected conditions like
validation rejections, missing optional resources, or user input errors. Use
`Effect.logWarning` for situations that should be visible but are recoverable.

---

## Logging errors

When an error occurs in a pipeline, choosing the right log level and logging
location prevents both observability gaps and noise.

### Log level for errors

| Situation                                        | Log level    | Why                                                          |
| ------------------------------------------------ | ------------ | ------------------------------------------------------------ |
| Expected domain error being handled or recovered | `logWarning` | Degraded but recovered — visible without alarming            |
| Genuine failure that needs attention             | `logError`   | Reserve for conditions that indicate something is broken     |
| Routine expected outcome logged for audit trail  | `logInfo`    | Normal event — cache miss, validation rejection, not found   |
| Defect reaching the runtime catch-all            | Automatic    | The runtime reports unhandled defects — no manual log needed |

### Log once, at the handling boundary

Log an error at the point where it is **handled, translated, or recovered** —
not at every layer it passes through. The handler has the best context for a
useful log entry.

```typescript
// Good: log at the handling boundary
Effect.tapErrorTag("ManifestError", (e) =>
  Effect.logWarning("manifest fetch failed", { code: e.code, extensionId }),
);

// Bad: logging at multiple layers as the error propagates
```

### Error context

When logging an error, include the error's tag and relevant identifiers as
structured fields:

```typescript
Effect.tapErrorTag("ManifestError", (e) =>
  Effect.logWarning("manifest fetch failed", { code: e.code, extensionId }),
);
```

Use `Effect.annotateLogs` for context that applies to all logs in a scope —
see [Annotating with context](#annotating-with-context). Error-specific fields
(error code, entity ID) go inline as log annotations.

---

## Annotating with context

Use `Effect.annotateLogs` to attach context that applies to all log calls within
a scope:

```typescript
const installExtension = (id: string) =>
  installPipeline.pipe(
    Effect.annotateLogs("extensionId", id),
    Effect.annotateLogs("command", "install"),
  );
```

All logs emitted within `installPipeline` will carry `extensionId` and `command`
as structured fields.

Annotations are scoped — they apply only to the effect they wrap, not globally.
Nest them to build up context through a call chain:

```typescript
const syncPack = (pack: Pack) =>
  Effect.gen(function* () {
    yield* Effect.logInfo("syncing pack");
    yield* syncExtensions(pack.extensions);
  }).pipe(
    Effect.annotateLogs("packId", pack.id),
    Effect.annotateLogs("extensionCount", pack.extensions.length),
  );
```

---

## Console output

For direct user-facing output (status messages, results, interactive feedback),
use Effect's `Console` module instead of `console.*`.

### Why Effect Console

| Aspect      | `console.log`          | `Console.log`                  |
| ----------- | ---------------------- | ------------------------------ |
| Testability | Side effect, hard mock | Effect, easily testable        |
| Tracing     | No context             | Integrates with Effect tracing |
| Composition | Imperative             | Composable with other Effects  |
| Timing      | Immediate              | Deferred until Effect runs     |

### Usage

```typescript
import { Console, Effect } from "effect";

Effect.gen(function* () {
  yield* Console.log("message"); // stdout
  yield* Console.error("error"); // stderr
  yield* Console.warn("warning"); // stderr
});
```

### Console vs Effect.log

- **`Effect.log*`** — structured application logging rendered to stderr. Use for
  operational signals (debug diagnostics, warnings, errors).
- **`Console.*`** — direct stdout/stderr output. Use for user-facing messages
  and interactive feedback.

In `--json` / machine-readable mode, `Effect.log*` output is suppressed or
routed to stderr while structured JSON goes to stdout. `Console.log` writes to
stdout regardless — use it only for intended user output.

---

## Testing

Do not write tests that assert on log or console output. Log statements are
observability side effects, not behavior — they should be free to change without
breaking tests. Test the behavior that produces the log-worthy event, not the
log itself.

---

## Logging checklist

- [ ] **Use Effect log functions** — `Effect.logInfo`, `Effect.logError`, etc.
      for application logging, not `console.*`
- [ ] **Right log level** — `logError` for genuine failures, `logWarning` for
      degraded states, `logInfo` for normal events
- [ ] **Log errors once** — at the handling boundary, not duplicated across
      layers
- [ ] **Annotate with context** — include structured fields (IDs, counts) that
      make logs searchable
- [ ] **Use Console for stdout** — user-facing output uses `Console` module, not
      direct `console.*` calls
- [ ] **No sensitive data** — logs must not contain passwords, tokens, API keys,
      or PII
- [ ] **Composable effects** — log calls are yielded within Effect generators,
      not called imperatively

---

## See Also

- [Effect Guide](./effect.md) — Core Effect patterns and skill index
- [Effect Console docs](https://effect.website/docs/console) — Complete Console
  API reference
