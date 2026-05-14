---
name: swift-tinyflags-cleanup-flag
description: Remove a stale TinyFlags flag and simplify Swift call sites.
---

# Cleanup TinyFlags Flag

Use this skill when a TinyFlags flag has reached its final treatment and
should be removed from a Swift package.

## Workflow

1. Identify the final behavior: enabled, disabled, or a specific variant.
2. Replace `flags.enabled(...)`, `flags.variant(...)`, and
   `flags.evaluate(...)` call sites with the final behavior. Remove any
   stranded `let _ = flags` bindings.
3. Delete the `builder.boolean(...)` or `builder.variant(...)` entry from
   the bundle constructor.
4. Remove the `static let` flag-name constant and any associated imports.
5. Delete tests that only exercise obsolete rollout branching.
6. Add or update tests for the final simplified behavior.
7. Search for the flag key across `*.swift` and `*.md` files — string
   literals will not be caught by the compiler.

## Guardrails

- Do not leave a deleted flag referenced in a string literal — the Swift
  compiler will not catch it.
- Do not keep rollout-specific tests after the rollout branch is gone.
- Preserve the package's public API unless release notes call out a breaking
  change.
- After cleanup, run `swift build` and `swift test` to confirm no references
  remain and no tests are dead.
