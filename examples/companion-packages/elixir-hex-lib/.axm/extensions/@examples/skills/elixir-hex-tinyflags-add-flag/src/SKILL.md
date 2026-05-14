---
name: elixir-hex-tinyflags-add-flag
description: Add a TinyFlags flag to an Elixir project with implementation, ExUnit tests, and rollout notes.
---

# Add TinyFlags Flag

Use this skill when adding a feature flag to an Elixir project that depends on
`agentxm_example_tinyflags` from Hex.

## Workflow

1. Find the module that builds the flag set via
   `AgentXM.Examples.TinyFlags.new/1` or `new!/1`. The example app keeps this
   in `lib/agentxm_example_pawmatch/flags.ex`.
2. Add the flag as a `BooleanFlag.new!/1` or `VariantFlag.new!/2` entry in the
   definitions map.
3. Prefer kebab-case keys for flag names (e.g. `"home-check-followup"`) and
   add a matching `@flag_<name>` module attribute or function so call sites
   reference a named constant rather than a raw string literal.
4. Add or update a `test/.../*_test.exs` ExUnit module covering default
   behavior and at least one rollout boundary.
5. Update the README or `mix run` help text when the flag is user-facing.

## Boolean Flags

Use `BooleanFlag.new!(default: false)` for a disabled-by-default feature.

Use `BooleanFlag.new!(default: false, rollout: 10)` for a percentage rollout.
The rollout is deterministic by `%{id: "..."}` context.

## Variant Flags

Use `VariantFlag.new!(["classic", "semantic"], default: "classic")` when the
call site needs a named treatment instead of `true` or `false`.

Use a `:rollout` map to allocate traffic:

```elixir
VariantFlag.new!(
  ["classic", "semantic"],
  default: "classic",
  rollout: %{"semantic" => 10}
)
```

## Done Criteria

- New flag has an explicit `:default` option.
- Rollout percentage is an integer in `0..100`.
- Variant rollouts reference only declared variants and never sum above 100.
- Tests cover default behavior and at least one rollout boundary.
- Call sites read the flag through a named constant, not a raw string literal.
- `mix format` is clean and `mix test` passes.
