---
name: effect-v4-resource-safety
description: Makes Effect v4 acquisition and cleanup safe under success, failure, and interruption. Use for open/close pairs, `try/finally`, clients, files, locks, subscriptions, servers, or background work whose owner or cancellation cleanup is unclear—even before Scope APIs are used. Skip values with no release action or externally owned lifetimes this code must not close.
compatibility: Effect 4.0.0-beta.107
---

# Effect v4 resource safety

Give every acquired resource one explicit owner and lifetime.

## Choose the lifetime

- Use `acquireUseRelease` for one local use.
- Use `acquireRelease` inside a scope when the resource must survive across several operations.
- Use a scoped `Layer` for a shared application service.
- Use `ensuring` for unconditional cleanup that is not itself resource acquisition.

Prefer the highest-level construct that expresses the lifetime. Manage `Scope` directly only when a dynamic or externally controlled lifetime requires it.

## Preserve guarantees

- Register release immediately after acquisition; do not leave an interruptible gap.
- If acquisition partially succeeds, clean that partial state before failing; release is registered only after successful acquisition.
- Finalizers must run correctly after failure or interruption.
- Make release idempotent when the underlying API permits repeated or racing shutdown.
- Keep long-running work interruptible. Narrow uninterruptible regions to state transitions that must be atomic.
- Tie subscriptions and child fibers to the same scope as the resource they use.

## Check ownership

- The component that acquires should usually release.
- Borrowed resources must not be closed by consumers.
- Transfer of ownership should be visible in the API.
- Surface acquisition and release failures according to the surrounding error policy; do not silently discard them.

Avoid manual `try/finally` around Effect programs and detached cleanup promises.
