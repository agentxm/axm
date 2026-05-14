---
name: cargo-tinyflags-cleanup-flag
description: Remove a stale TinyFlags flag and simplify Rust call sites.
---

# Cleanup TinyFlags Flag

Use this skill when a TinyFlags flag has reached its final treatment and
should be removed from a Cargo crate.

## Workflow

1. Identify the final behavior: enabled, disabled, or a specific variant.
2. Replace `flags.enabled(...)`, `flags.variant(...)`, and
   `flags.evaluate(...)` call sites with the final behavior. Make sure
   unused locals like `let _ = flags;` are removed so `cargo clippy` stays
   quiet.
3. Delete the flag entry from the `Flags::builder()...add(...)` chain.
4. Remove the `FLAG_*` constant and any associated imports.
5. Delete tests that only exercise obsolete rollout branching.
6. Add or update tests for the final simplified behavior.
7. Search for the flag key across `*.rs` files, README files, and doc
   comments.

## Guardrails

- Do not leave a deleted flag referenced in a string literal — the compiler
  will not catch it.
- Do not keep rollout-specific tests after the rollout branch is gone.
- Preserve the crate's public API unless release notes call out a breaking
  change.
- After cleanup, run `cargo fmt --check`, `cargo clippy --all-targets --
  -D warnings`, and `cargo test` to confirm no references remain and no
  tests are dead.
