---
name: zig-zon-tinyflags-rollout-review
description: Review TinyFlags flag definitions and call sites for safe Zig rollouts.
---

# TinyFlags Rollout Review

Use this skill before increasing rollout percentages or shipping a new
TinyFlags-backed behavior in a Zig package.

## Review Checklist

- Every flag is constructed with an explicit default — do not pass an
  uninitialized boolean or a first-variant fallback.
- Boolean rollouts pass a `u8` in `0..=100` to `Flag.booleanRollout(...)`.
- Variant rollout totals do not exceed 100.
- Unknown variant names are not referenced in `variantWithRollout(...)`
  allocations.
- Every call site supplies a stable `Context.init(...)` — never `""` from a
  request-scoped task without intent.
- Tests use the built-in `test "..."` form and live in the same file as the
  module they exercise (or under `src/`).
- No code path assumes rollout bucketing is random per request — bucketing
  is deterministic for a given `(flag name, Context.id)` pair.

## Zig Details

Prefer importing once and aliasing locally:

```zig
const tf = @import("tinyflags");

var registry = try tf.Registry.init(allocator, &.{
    .{ .name = "checkout-redesign", .flag = tf.Flag.booleanDefault(true) },
});
defer registry.deinit();
```

Construct the package-level flag set in one place (a single
`buildFlags(allocator)` function) and pass the resulting `Registry` into call
sites — invalid definitions are programmer errors caught at startup.

Rollout changes should be small and reviewable. If a rollout moves from 0 to
100, confirm the disabled branch can be deleted or explain why the flag
remains temporary.
