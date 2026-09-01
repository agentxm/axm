---
status: active
last-reviewed: 2026-08-18
version: 0.4.0
description: Consult when an AXM service or command can fail. Defines the AXM-only AppError, registry translation, cancellation, and runtime-boundary policy.
depends-on:
  - ./effect.md
---

# Effect Errors in AXM

Portable error modeling belongs to the Effect v4 Knowledge guide for
[error modeling](../../agent_extensions/agentxm/@craigsmitham/knowledge/effect-v4/src/error-modeling.md).
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
[`ExitCode`](../../packages/extension-management/src/unstable/app-error/app-error.ts).

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
`registryClientErrorToProblem` or `registryErrorToProblem` from
`packages/registry-client/src/translate.ts`; the application boundary converts
the typed registry failures to `AppError` through the registered
`app-error/conversions` dispatcher. Do not add operation-local HTTP status
switches. Keep RFC 9457 response bodies opaque in `metadata.response`; decode a
focused schema next to a use case that needs a specific field. Configure transport, transient retry, and client provision at
the shared boundary described by the Effect v4
[HTTP client](../../agent_extensions/agentxm/@craigsmitham/knowledge/effect-v4/src/http-client.md)
guide.

## Cancellation and interruption

`PromptCancelled` is control flow, not an `AppError`. The shared plan boundary
turns cancellation at a confirmable-risk prompt into a visible
`CancelledPlan`, exit 0, with no writes.

SIGINT is different: graceful shutdown interrupts the active fiber, awaits
rollback finalizers, emits `interrupted`, and exits 130.

`withRuntime` accepts only `Effect<A, AppError | PromptCancelled, R>`. Translate
other expected errors before that boundary; defects remain defects.

## Failure-collapse census

The 2026-08 census reviewed 148 production uses of `catchAll`, `catchCause`,
`option`, and `ignore`. A collapse is sanctioned only when the reduced result
is itself the feature contract: an existence/optional probe, best-effort
discovery or diagnostic collection, idempotent cleanup, or translation at the
owning application boundary. Preserve the cause in logs or the translated
`AppError` when the caller still needs failure evidence.

The census removed unsafe operational collapses in package materialization,
configuration writes, inspection, Git execution, and archive validation.
Repository gates now reject thrown `Effect.sync` bodies and undocumented
`Effect.orDie`/`Layer.orDie` sites. Do not turn a new filesystem, network,
authentication, configuration, validation, or persistence failure into
`Option.none`, `false`, an empty collection, or success without documenting why
that value is the complete domain result.

## Checklist

- [ ] Command error channel is `AppError | PromptCancelled`.
- [ ] `makeAppError` preserves the original cause.
- [ ] Registry failures use the shared translator.
- [ ] Prompt cancellation and process interruption retain distinct semantics.
