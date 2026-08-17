---
type: Guide
title: Wrapping
description: Turning Promise, callback, and synchronous foreign APIs into truthful Effect boundaries; use for raw promises, thrown `unknown` failures, cancellation that must propagate, and vendor SDKs becoming injectable capabilities.
tags: [effect, effect-v4, wrapping, promise, callbacks, interop, adapters, cancellation]
status: stable
sources:
  - id: docs-creating-effects
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/ai-docs/src/01_effect/01_basics/10_creating-effects.ts
    title: Official Effect docs — the wrap-construct set (sync, try, tryPromise, fromNullishOr, callback with finalizer) (effect 4.0.0-rc.110)
  - id: src-effect
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Effect.ts
    title: Effect module source — tryPromise AbortSignal contract, callback constructor, throwing-catch defect gotcha (effect 4.0.0-rc.110)
  - id: test-effect
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/test/Effect.test.ts
    title: Effect tests — tryPromise aborts its AbortSignal and callback cleanup runs on interruption (effect 4.0.0-rc.110)
  - id: applied-dfx
    resource: https://github.com/tim-smart/dfx/blob/23988a4f182eb5cebc6c3bbac3f3c35fd303168f/src/Interactions/webhook.ts
    title: dfx@23988a4 — Effect.try translating a thrown parse once into a typed error carrying the cause
  - id: applied-opencode
    resource: https://github.com/anomalyco/opencode/blob/2cba7e227d68a7e7e4a2aa9c85b808e8ecb14daf/packages/core/src/fs-util.ts
    title: opencode@2cba7e2 — tryPromise-wrapped platform API exposed as a small typed capability
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-wrapping/src/SKILL.md
    title: effect-v4-wrapping skill 0.1.0 (retired into this bundle; lineage only)
generated:
  by: claude/fable-5
  at: 2026-08-17T14:19:12Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:19:12Z
---

# Wrapping

A wrapper is a boundary adapter: it must describe success, expected failure,
interruption, dependencies, and resource ownership without pretending the
foreign API has stronger semantics.

**Applies when** async APIs leak raw promises, thrown or unknown failures need
typed mapping, cancellation must propagate, or a library client should become an
injectable service.

**Leave alone** pure synchronous functions and APIs already returning Effect
with suitable error and lifetime semantics.

Related: [Error modeling](error-modeling.md) for the typed failures a wrapper
produces, [Services and layers](services-and-layers.md) for exposing the client
as a capability, [Resource safety](resource-safety.md) for scoped acquisition.

## Wrap one operation

```ts
import { Effect } from "effect"

const fetchUser = (id: UserId) =>
  Effect.tryPromise({
    try: (signal) => client.users.get(id, { signal }),
    catch: (cause) => new UserLookupError({ id, cause }),
  })
```

- Use `Effect.sync` or `Effect.try` for synchronous boundaries,
  `Effect.tryPromise` for Promise APIs, and `Effect.fromNullishOr` for
  nullable lookups that should fail with a typed
  error.[^docs-creating-effects]
- Pass the supplied `AbortSignal` through when the dependency supports
  cancellation. The underlying operation only stops if it observes the
  signal; if it cannot cancel, document that interruption only stops
  waiting.[^src-effect]
- Narrow `unknown` into a stable domain error exactly once at the boundary.
  Preserve the original cause and safe operation context; never expose
  credentials or raw sensitive payloads.[^applied-dfx]
- Keep defects as defects: do not translate programmer bugs into retryable
  business failures, and return — never throw — the mapped error from
  `catch`, since a throwing mapper becomes a defect.[^src-effect]

## Wrap a callback API

```ts
import { Effect } from "effect"

const nextMessage = Effect.callback<Message, SocketClosed>((resume) => {
  const onMessage = (message: Message) => resume(Effect.succeed(message))
  const onClose = () => resume(Effect.fail(new SocketClosed()))
  socket.on("message", onMessage)
  socket.on("close", onClose)
  return Effect.sync(() => {
    socket.off("message", onMessage)
    socket.off("close", onClose)
  })
})
```

- Use `Effect.callback` for APIs that complete through callbacks instead of
  returning a Promise. Call `resume` at most once with the completing
  effect; later calls are ignored.[^src-effect]
- Return a cleanup effect from the registration — deregister listeners,
  clear timers, abort requests — so interruption cancels the underlying
  source instead of leaking it.[^test-effect]
- The registration also receives an `AbortSignal`, aborted on interruption,
  for callback APIs that already accept one.[^src-effect]

## Wrap a client as a capability

- Keep raw SDK values inside the adapter; decode into trusted domain values
  before returning them.[^applied-opencode]
- Give the wrapper a domain-term surface smaller and more stable than the
  vendor SDK.
- Put retries, timeouts, and concurrency limits at the boundary that knows
  idempotency and provider capacity.
- Service interface shape, least capability, and configuration during
  construction are owned by [Services and layers](services-and-layers.md);
  the wrapped client's acquisition and release are owned by
  [Resource safety](resource-safety.md).

## Review checklist

- No raw Promise escapes into Effect-owned logic.
- Every expected foreign failure maps from `unknown` to a typed domain error
  exactly once.
- Cancellation matches the underlying API: the signal is observed, a callback
  registration returns its finalizer, or the stops-waiting limitation is
  documented.
- The adapter surface is smaller and more stable than the wrapped SDK, and
  raw SDK values do not escape it.
- Retries occur only for bounded, typed, and safe-to-repeat operations.

[^docs-creating-effects]: `ai-docs/src/01_effect/01_basics/10_creating-effects.ts` at `effect@4.0.0-rc.110` — `Effect.sync`, `Effect.try`, `Effect.tryPromise`, `Effect.fromNullishOr`, and `Effect.callback` with a returned finalizer.
[^src-effect]: `packages/effect/src/Effect.ts` at `effect@4.0.0-rc.110` — `tryPromise` receives an `AbortSignal` and "the underlying asynchronous operation only stops if it observes that signal"; a throwing `catch` mapper is treated as a defect; `callback` resumes at most once and may return a cleanup effect.
[^test-effect]: `packages/effect/test/Effect.test.ts` at `effect@4.0.0-rc.110` — "aborts the provided AbortSignal on interruption" and "callback cleanup effect runs on interrupt".
[^applied-dfx]: Observed in dfx@23988a4 `src/Interactions/webhook.ts` (effect peer `>=4.0.0-beta.101`, dev `4.0.0-beta.105`).
[^applied-opencode]: Observed in opencode@2cba7e2 `packages/core/src/fs-util.ts` (effect 4.0.0-beta.83).
