---
name: zig-zon-tinyflags-add-flag
description: Add a TinyFlags flag to a Zig package with implementation, tests, and rollout notes.
---

# Add TinyFlags Flag

Use this skill when adding a feature flag to a Zig package that depends on
`agentxm_example_tinyflags` (imported as `tinyflags`).

## Workflow

1. Find the function that builds the `Registry` with `Registry.init(...)`.
   The example app keeps this in `src/flags.zig`.
2. Add the flag as a `Flag.booleanDefault(...)` / `Flag.booleanRollout(...)`
   or `Flag.variantDefault(...)` / `Flag.variantWithRollout(...)` entry on
   the entries slice.
3. Prefer kebab-case keys for flag names (`home-check-followup`), and add a
   matching `FLAG_*` `[]const u8` constant in the same module so call sites
   use the constant rather than a string literal.
4. Add or update `test "..."` blocks alongside the module. Cover the default
   behavior and at least one rollout boundary. Run with `zig build test`.
5. Update the README or CLI help text when the flag is user-facing.

## Boolean Flags

Use `Flag.booleanDefault(false)` for a disabled-by-default feature.

Use `try Flag.booleanRollout(false, 10)` for a percentage rollout (0..=100).
The rollout is deterministic by `Context`.

## Variant Flags

Use
`try Flag.variantDefault(allocator, &.{ "classic", "semantic" }, "classic")`
when the call site needs a named treatment instead of `true` / `false`.

Use `variantWithRollout` to allocate traffic:

```zig
const flag = try tf.Flag.variantWithRollout(
    allocator,
    &.{ "classic", "semantic" },
    "classic",
    &.{ .{ .name = "semantic", .percentage = 10 } },
);
```

## Done Criteria

- New flag has an explicit default value.
- Rollout percentage is a `u8` in `0..=100`.
- Variant rollouts reference only declared variants.
- Tests cover default behavior and at least one rollout boundary.
- Call sites read the flag through a `FLAG_*` constant, not a string literal.
- `zig build` and `zig build test` both pass.
