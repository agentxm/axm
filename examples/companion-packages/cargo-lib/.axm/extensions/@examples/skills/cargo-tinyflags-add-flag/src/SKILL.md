---
name: cargo-tinyflags-add-flag
description: Add a TinyFlags flag to a Rust project with implementation, tests, and rollout notes.
---

# Add TinyFlags Flag

Use this skill when adding a feature flag to a Cargo crate that depends on
`agentxm-example-tinyflags` (imported as `tinyflags`).

## Workflow

1. Find the function that builds the `Flags` set with `Flags::builder()`. The
   example app keeps this in `crates/pawmatch/src/flags.rs`.
2. Add the flag as a `Flag::boolean()...build()` or
   `Flag::variant(...)...build()` entry on the builder chain.
3. Prefer kebab-case keys for flag names (`home-check-followup`), and add a
   matching `FLAG_*` `&str` constant in the same module so call sites use the
   constant rather than a string literal.
4. Add or update tests using built-in `#[test]` and the `assert!` /
   `assert_eq!` macros. Cover the default behavior and at least one rollout
   boundary.
5. Update the crate README or CLI help text when the flag is user-facing.

## Boolean Flags

Use `Flag::boolean().default(false).build()?` for a disabled-by-default
feature.

Use `Flag::boolean().default(false).rollout(10).build()?` for a percentage
rollout. The rollout is deterministic by `Context`.

## Variant Flags

Use `Flag::variant(["classic", "semantic"]).default("classic").build()?` when
the call site needs a named treatment instead of true or false.

Use `.rollout([...])` to allocate traffic:

```rust
use tinyflags::Flag;

let flag = Flag::variant(["classic", "semantic"])
    .default("classic")
    .rollout([("semantic", 10)])
    .build()?;
# Ok::<_, tinyflags::FlagError>(())
```

## Done Criteria

- New flag has an explicit `.default(...)` on its builder.
- Rollout percentage is in `0..=100`.
- Variant rollouts reference only declared variants.
- Tests cover default behavior and at least one rollout boundary.
- Call sites read the flag through a `FLAG_*` constant, not a string literal.
- `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, and
  `cargo test` all pass.
