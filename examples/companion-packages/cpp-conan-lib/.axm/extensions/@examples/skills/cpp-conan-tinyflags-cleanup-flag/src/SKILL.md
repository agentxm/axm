---
name: cpp-conan-tinyflags-cleanup-flag
description: Remove a stale TinyFlags flag and simplify C++ call sites.
---

# Cleanup TinyFlags Flag

Use this skill when a TinyFlags flag has reached its final treatment and
should be removed from a C++ project.

## Workflow

1. Identify the final behavior: enabled, disabled, or a specific variant.
2. Replace `flags.enabled(...)`, `flags.variant(...)`, and
   `flags.evaluate(...)` call sites with the final behavior.
3. Delete the `registry.add(...)` registration for the flag.
4. Remove Catch2 cases that only exercise obsolete rollout branching.
5. Add or update tests for the final simplified behavior.
6. Search for the flag name (as a string literal) under `include/`, `src/`,
   `test/`, `README.md`, and any docs.

## Guardrails

- Do not leave a deleted flag referenced in a string literal anywhere in
  the tree.
- Do not keep rollout-specific tests after the rollout branch is gone.
- Preserve ABI compatibility unless the library's release notes explicitly
  call out a breaking change. In particular, do not remove or reorder
  public symbols in `include/agentxm/tinyflags.hpp` as a side effect.
- Keep C++ style consistent with the project (header guards, namespaces,
  `clang-format` config) when editing `flags.hpp` / `flags.cpp`.
