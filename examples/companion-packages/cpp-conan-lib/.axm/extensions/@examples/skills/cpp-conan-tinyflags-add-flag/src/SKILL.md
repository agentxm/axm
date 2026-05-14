---
name: cpp-conan-tinyflags-add-flag
description: Add a TinyFlags flag to a C++ Conan project with implementation, tests, and rollout notes.
---

# Add TinyFlags Flag

Use this skill when adding a feature flag to a C++ project that consumes
`agentxm-example-tinyflags` via Conan.

## Workflow

1. Find the translation unit that constructs the
   `agentxm::tinyflags::Registry` (typically a `flags.cpp` / `flags.hpp` pair
   near the call sites).
2. Add the flag as a `BooleanFlag::with_default(...)` or
   `VariantFlag::create({...})` registration on the registry.
3. Prefer `kebab-case` flag names that mirror the call-site behavior.
4. Add or update Catch2 coverage under `test/` for default behavior and the
   rollout boundary. Run via `ctest --test-dir build --output-on-failure`,
   or `conan create . --build=missing` to exercise the recipe end-to-end.
5. Update `README.md` or local docs when the flag is user-facing.

## Boolean Flags

Use `BooleanFlag::with_default(false)` for a disabled-by-default feature.

Chain `.with_rollout(10)` for a percentage rollout. Rollout bucketing is
deterministic by `Context::id()` so the same caller always receives the
same answer.

## Variant Flags

Use
`VariantFlag::create({"classic", "semantic"}).with_default("classic")` when
the call site needs a named treatment instead of `true` / `false`.

Add `.with_rollout({{"semantic", 10}})` to allocate traffic. Allocations are
a `std::vector<std::pair<std::string, int>>` of `(variant-name, percentage)`
entries and must reference declared variants only.

## Done Criteria

- New flag has an explicit `.with_default(...)` call.
- Rollout percentage is an integer from 0 to 100.
- Variant rollouts reference only declared variants and sum to ≤ 100.
- Catch2 tests cover default behavior and at least one rollout boundary.
- Dead conditional branches are not introduced.
