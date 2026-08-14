---
type: Guide
title: Structured concurrency
description: Structuring parallel and background work around owned lifetimes; use for detached promises, `Promise.all`, `AbortController`, manual races, or unbounded parallelism.
tags: [effect, effect-v4, concurrency, fibers, forking, supervision, cancellation, shutdown]
status: stable
sources:
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-structured-concurrency/src/SKILL.md
    title: effect-v4-structured-concurrency skill 0.1.0 (retired into this bundle)
generated:
  by: claude/opus-5
  at: 2026-08-12T16:20:19Z
---

# Structured concurrency

Every child fiber should have an owner, completion policy, and concurrency bound.

**Applies when** code uses detached promises, `Promise.all`, `AbortController`,
manual races, orphanable background tasks, or unbounded parallelism — even
without existing fibers.

**Leave alone** sequential work, and intentionally external jobs whose lifetime
is owned by another system.

Related: [Iteration](iteration.md) for choosing the traversal primitive,
[Resource safety](resource-safety.md) for scoped cleanup under interruption,
[Async coordination](async-coordination.md) for shared admission control.

## Prefer structured operations

- Use `Effect.all`, `forEach`, racing, timeout, and other high-level combinators when the parent should await a result.
- Set concurrency explicitly for collections whose size is not tightly bounded.
- Expect losing race branches and timed-out work to be interrupted; adapters must honor cancellation.
- Preserve input/output ordering only when required, because it can constrain streaming or completion behavior.

## Fork with a lifetime

- Use `forkChild` for work supervised by the parent and `forkScoped` for work owned by the current scope.
- Use `forkIn` only when an explicit scope is the real owner.
- Treat `forkDetach` as an exceptional daemon choice. Document who observes failure and stops it.
- Join, interrupt, or otherwise observe fibers whose outcome matters.

## Keep cancellation sound

- Acquire resources in scopes so interrupted children release them.
- Keep blocking or callback adapters cancellation-aware.
- Restrict uninterruptible regions to short critical transitions, restoring interruptibility around waiting or I/O.
- Decide whether sibling failure should fail fast, accumulate results, or be isolated; encode that policy explicitly.

Avoid fire-and-forget effects and accidental fan-out over unbounded inputs.

## Choose parallel failure semantics

- Effect collection operations are sequential by default. Add an explicit
  numeric concurrency bound for variable-size inputs; reserve unbounded
  concurrency for a small fixed group.
- Decide whether the first failure interrupts siblings or whether every outcome
  is collected as data. Preserve every failure required by the contract.
- Use timeout/race only when losing work may be interrupted safely. Foreign
  adapters must accept cancellation or clearly state that interruption only
  stops waiting.
- Put admission limits shared across call sites in a Semaphore; keep a local
  traversal bound local when no cross-call coordination is needed.

## Supervise shutdown

- On shutdown, stop admitting work, signal owned producers, await the accepted
  drain window, then interrupt remaining child fibers and release resources.
- Use scoped acquisition for listeners, queues, workers, and connections so
  parent interruption cannot leak them.
- Observe every detached fiber's failure through supervision or explicit
  logging. A daemon with no failure observer is lost work.

## Review checklist

- Parent, scope, or explicit supervisor owns every child fiber.
- Concurrency is bounded and derived from real capacity.
- Sibling failure, result accumulation, ordering, and race-loss behavior are
  explicit.
- Cancellation reaches adapters and releases scoped resources.
- Shutdown has a defined admission, drain, interrupt, and observation sequence.
