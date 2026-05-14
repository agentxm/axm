---
name: elixir-hex-tinyflags-rollout-review
description: Review TinyFlags flag definitions and call sites for safe Elixir rollouts.
---

# TinyFlags Rollout Review

Use this skill before increasing rollout percentages or shipping a new
TinyFlags-backed behavior in an Elixir project.

## Review Checklist

- Every flag is constructed with an explicit `:default` value — do not rely
  on `nil` or implicit `false`.
- Boolean rollouts use integers from `0..100` via `BooleanFlag.new!(rollout: ...)`.
- Variant rollout totals do not exceed 100.
- Unknown variants are not referenced in variant rollout maps.
- Every call site supplies a stable bucketing key in the context map
  (`%{id: user_id}` or `%{user_id: user_id}`), never an empty `%{}` from a
  request-scoped process.
- ExUnit tests live next to the module they exercise under `test/`.
- No code path assumes rollout bucketing is random per request — bucketing is
  deterministic for a given `{flag name, context id}` pair.

## Elixir Details

Use the public API and avoid touching internal struct fields:

```elixir
alias AgentXM.Examples.TinyFlags
alias AgentXM.Examples.TinyFlags.{BooleanFlag, VariantFlag}

flags =
  TinyFlags.new!(%{
    "checkout-redesign" => BooleanFlag.new!(default: true)
  })

{:ok, value} = TinyFlags.enabled(flags, "checkout-redesign", %{id: "user-1"})
```

Prefer the `new!/1` and `new!/2` constructors for module-level flag tables —
invalid definitions are programmer errors caught at compile time when the
module is loaded. Use the `{:ok, _} | {:error, _}` variants only when flag
input is loaded from configuration at runtime.

Rollout changes should be small and reviewable. If a rollout moves from 0 to
100, confirm the disabled branch can be deleted or explain why the flag
remains temporary.
