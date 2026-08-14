---
type: Guide
title: Wrapping
description: Turning Promise, callback, and third-party APIs into truthful Effect boundaries with typed failure and real cancellation.
tags: [effect, effect-v4, wrapping, promise, callbacks, interop, adapters, cancellation]
status: stable
sources:
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-wrapping/src/SKILL.md
    title: effect-v4-wrapping skill 0.1.0 (retired into this bundle)
generated:
  by: claude/opus-5
  at: 2026-08-12T16:20:19Z
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
const fetchUser = (id: UserId) =>
  Effect.tryPromise({
    try: (signal) => client.users.get(id, { signal }),
    catch: (cause) => new UserLookupError({ id, cause }),
  })
```

- Use `Effect.sync` or `Effect.try` for synchronous boundaries and
  `Effect.tryPromise` for Promise APIs.
- Accept the supplied abort signal when the dependency supports cancellation.
  If it cannot cancel, document that interruption only stops waiting.
- Narrow `unknown` into a stable domain error. Preserve the original cause and
  safe operation context; never expose credentials or raw sensitive payloads.
- Keep defects as defects. Do not translate programmer bugs into retryable
  business failures.

## Wrap a client as a capability

- Expose a small service interface in domain terms rather than mirroring an
  entire vendor SDK.
- Acquire clients, sockets, subscriptions, or sessions in a Layer with the
  correct scoped release action.
- Resolve configuration and credentials during construction, not at arbitrary
  call sites.
- Put retries, timeouts, and concurrency limits at the boundary that knows
  idempotency and provider capacity.
- Keep raw SDK values inside the adapter; decode into trusted domain values
  before returning them.

## Review checklist

- No raw Promise escapes into Effect-owned logic.
- Every expected foreign failure maps from `unknown` to a typed domain error.
- Cancellation and cleanup behavior match the underlying API.
- The service surface is smaller and more stable than the wrapped SDK.
- Retries occur only for bounded, typed, and safe-to-repeat operations.
