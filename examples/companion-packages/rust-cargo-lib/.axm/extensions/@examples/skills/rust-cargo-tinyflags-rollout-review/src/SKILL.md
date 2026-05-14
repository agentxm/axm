---
name: rust-cargo-tinyflags-rollout-review
description: Review TinyFlags flag definitions and call sites for safe Rust rollouts.
---

# TinyFlags Rollout Review

Use this skill before increasing rollout percentages or shipping a new
TinyFlags-backed behavior in a Cargo crate.

## Review Checklist

- Every flag is constructed with an explicit `.default(...)` on its builder —
  do not rely on the implicit `false` for booleans or the first-variant
  fallback for variant flags.
- Boolean rollouts pass an integer in `0..=100` to `.rollout(...)`.
- Variant rollout totals do not exceed 100.
- Unknown variants are not referenced in `.rollout([...])` allocations.
- Every call site supplies a stable `Context::new(...)` — never the
  `Context::default()` zero value from a request-scoped task.
- Tests use the built-in `#[test]` attribute and live next to the module they
  exercise (or under `tests/`).
- No code path assumes rollout bucketing is random per request — bucketing is
  deterministic for a given `(flag name, Context.id)` pair.

## Rust Details

Check the import path and prefer a `use` statement rather than fully-qualified
paths at every call site:

```rust
use tinyflags::{Context, Flag, Flags};

let flags = Flags::builder()
    .add(
        "checkout-redesign",
        Flag::boolean().default(true).build()?,
    )
    .build()?;
# Ok::<_, tinyflags::FlagError>(())
```

Prefer constructing the package-level flag set in one place (a single
`new_flags()` function) and pass the resulting `Flags` value into call sites —
invalid definitions are programmer errors caught at process start.

Rollout changes should be small and reviewable. If a rollout moves from 0 to
100, confirm the disabled branch can be deleted or explain why the flag
remains temporary.
