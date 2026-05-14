---
name: cocoapods-tinyflags-cleanup-flag
description: Remove a stale TinyFlags flag and simplify Swift call sites in a CocoaPods project.
---

# Cleanup TinyFlags Flag

Use this skill when a TinyFlags flag has reached its final treatment and should
be removed from a CocoaPods Swift project.

## Workflow

1. Identify the final behavior: enabled, disabled, or a specific variant.
2. Replace `flags.enabled(_:context:)`, `flags.variant(_:context:)`, and
   `flags.evaluate(_:context:)` call sites with the final behavior.
3. Delete the flag definition from the `TinyFlags.builder()` chain.
4. Remove XCTest cases that only exercise obsolete rollout branching.
5. Add or update XCTest cases for the final simplified behavior.
6. Search for the flag key in Swift sources, tests, READMEs, and the
   project's `Podfile` lock notes.

## Guardrails

- Do not leave a deleted flag referenced in a string literal.
- Do not keep rollout-specific tests after the rollout branch is gone.
- Preserve public Swift API compatibility unless release notes call out a
  breaking change.
- Keep Swift access modifiers and `@Sendable` annotations intact.
- If the cleanup changes the public surface, bump the pod's `s.version` and
  add release notes in the podspec or README.
