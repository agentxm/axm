---
type: Guide
title: Resource safety
description: Making acquisition and cleanup safe under success, failure, and interruption; use for open/close pairs, `try/finally`, clients, locks, and background work.
tags: [effect, effect-v4, scope, resources, finalizers, interruption, acquire-release, ownership]
status: stable
sources:
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-resource-safety/src/SKILL.md
    title: effect-v4-resource-safety skill 0.1.0 (retired into this bundle)
generated:
  by: claude/opus-5
  at: 2026-08-12T16:20:19Z
---

# Resource safety

Give every acquired resource one explicit owner and lifetime.

**Applies when** code has open/close pairs, `try/finally`, clients, files,
locks, subscriptions, servers, or background work whose owner or cancellation
cleanup is unclear — even before Scope APIs are used.

**Leave alone** values with no release action, and externally owned lifetimes
this code must not close.

Related: [Structured concurrency](structured-concurrency.md) for fiber
ownership, [Services and layers](services-and-layers.md) for scoped layers,
[Wrapping](wrapping.md) for adapters that must honor cancellation.

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
