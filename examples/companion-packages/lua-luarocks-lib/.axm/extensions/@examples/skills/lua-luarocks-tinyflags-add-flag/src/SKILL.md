---
name: lua-luarocks-tinyflags-add-flag
description: Add a TinyFlags flag to a Lua rock project with implementation, busted specs, and rollout notes.
---

# Add TinyFlags Flag

Use this skill when adding a feature flag to a Lua project that uses
`agentxm-example-tinyflags`.

## Workflow

1. Find the Lua module that constructs the `tinyflags.Registry` from its
   definitions table (typically `src/<rock>/flags.lua` or similar).
2. Add the flag as a `tinyflags.BooleanFlag{...}` or
   `tinyflags.VariantFlag{...}` entry.
3. Prefer `kebab-case` flag names that mirror the call-site behavior.
4. Add or update busted coverage in `spec/` for default behavior and rollout
   behavior. Run via `busted spec/`.
5. Update README or local rock docs when the flag is user-facing.

## Boolean Flags

Use `tinyflags.BooleanFlag({ default = false })` for a disabled-by-default
feature.

Use `tinyflags.BooleanFlag({ default = false, rollout = 10 })` for a
percentage rollout. Rollout bucketing is deterministic by `user_id`,
`account_id`, or `session_id` from the evaluation context table.

## Variant Flags

Use `tinyflags.VariantFlag({ variants = { "classic", "semantic" }, default = "classic" })`
when the call site needs a named treatment instead of `true`/`false`.

Use `rollout = { ... }` to allocate traffic:

```lua
tinyflags.VariantFlag({
  variants = { "classic", "semantic" },
  default = "classic",
  rollout = { semantic = 10 },
})
```

## Done Criteria

- New flag has an explicit `default = ...` keyword.
- Rollout percentage is an integer from 0 to 100 (not a fractional number,
  not a boolean).
- Variant rollouts reference only declared variants.
- busted specs cover default behavior and at least one rollout boundary.
- Dead conditional branches are not introduced.
