---
status: active
last-reviewed: 2026-08-17
version: 0.4.0
description: Consult when an AXM service or command can fail. Defines the AXM-only AppError, registry translation, cancellation, and runtime-boundary policy.
depends-on:
  - ./effect.md
---

# Effect Errors in AXM

Portable error modeling belongs to the Effect v4 Knowledge guide for
[error modeling](../../.axm/extensions/@craigsmitham/knowledge/effect-v4/src/error-modeling.md),
routed by the installed `craft-effect-v4` skill.
This guide defines AXM's application boundary.

## Boundary model

Services may expose focused typed errors when callers need distinct recovery.
Command handlers translate every expected failure to `AppError` before
`withRuntime`.

Do not use `Effect.orDie`, `Effect.die`, thrown exceptions, or unchecked
Promise rejection to erase configuration, filesystem, network, registry,
authentication, validation, or persistence failures. Defects are reserved for
violated internal invariants that callers cannot recover from.

```text
service errors -> command translation -> AppError | PromptCancelled -> runtime
```

`AppError` is AXM's single CLI-facing failure. Use `makeAppError`, preserve the
original `cause`, and choose one closed category: `issues`, `usage`,
`not_found`, `auth`, `forbidden`, `conflict`, `rate_limit`, `network`,
`validation`, `internal`, `unavailable`, or `quota`. Numeric exit status is a
pure mapping owned by
[`ExitCode`](../../packages/core/src/unstable/app-error/app-error.ts).

- `usage` means the invocation shape is wrong; `validation` means a parsed
  value violates domain rules.
- `issues` means a diagnostic command completed and found actionable problems;
  `internal` means the command failed unexpectedly.
- `auth` means credentials are missing or expired; `forbidden` means the
  authenticated identity lacks permission.
- Operational errors may use `suggestions`, or the `recover` and optional `cmd`
  convenience fields, for a direct prerequisite such as authentication. Lint
  findings follow the fact-only contract in
  [Lint](../../docs/architecture/commands/lint.md)
  and never carry recovery suggestions.

## Registry failures

Translate generated Registry client failures with
`registryClientErrorToAppError` or `registryErrorToAppError` from
`packages/core/src/unstable/registry/translate.ts`. Do not add operation-local
HTTP status switches. Keep RFC 9457 response bodies opaque in
`metadata.response`; decode a focused schema next to a use case that needs a
specific field.

## Cancellation and interruption

`PromptCancelled` is control flow, not an `AppError`. The shared plan boundary
turns cancellation at a confirmable-risk prompt into a visible
`CancelledPlan`, exit 0, with no writes.

SIGINT is different: graceful shutdown interrupts the active fiber, awaits
rollback finalizers, emits `interrupted`, and exits 130.

`withRuntime` accepts only `Effect<A, AppError | PromptCancelled, R>`. Translate
other expected errors before that boundary; defects remain defects.

## Checklist

- [ ] Command error channel is `AppError | PromptCancelled`.
- [ ] `makeAppError` preserves the original cause.
- [ ] Registry failures use the shared translator.
- [ ] Prompt cancellation and process interruption retain distinct semantics.
