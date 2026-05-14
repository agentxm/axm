---
name: maven-java-tinyflags-cleanup-flag
description: Remove a stale TinyFlags flag and simplify Java call sites.
---

# Cleanup TinyFlags Flag

Use this skill when a TinyFlags flag has reached its final treatment and
should be removed from a Maven Java project.

## Workflow

1. Identify the final behavior: enabled, disabled, or a specific variant.
2. Replace `flags.enabled(...)`, `flags.variant(...)`, and
   `flags.evaluate(...)` call sites with the final behavior.
3. Delete the `.booleanFlag(...)` or `.variantFlag(...)` registration from the
   `TinyFlags.builder()` pipeline.
4. Remove JUnit 5 tests that only exercise obsolete rollout branching.
5. Add or update tests for the final simplified behavior.
6. Search for the flag key in Java sources, tests, README files, and
   examples.

## Guardrails

- Do not leave a deleted flag referenced in a string literal.
- Do not keep rollout-specific tests after the rollout branch is gone.
- Preserve public API compatibility unless release notes call out a breaking
  change.
- Keep package imports and class layout consistent with the rest of the
  project.
- Run `mvn test` after every change.
