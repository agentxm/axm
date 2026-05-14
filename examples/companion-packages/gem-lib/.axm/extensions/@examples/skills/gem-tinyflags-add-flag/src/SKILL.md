---
name: gem-tinyflags-add-flag
description: Add a TinyFlags flag to a Ruby gem project with implementation, tests, and rollout notes.
---

# Add TinyFlags Flag

Use this skill when adding a feature flag to a Ruby project that uses
`agentxm-example-tinyflags`.

## Workflow

1. Find the Ruby file that constructs the `TinyFlags::Registry` from its
   definitions Hash (typically `lib/<gem>/flags.rb` or similar).
2. Add the flag as a `TinyFlags::BooleanFlag.new(...)` or
   `TinyFlags::VariantFlag.new(...)` entry.
3. Prefer `kebab-case` flag names that mirror the call-site behavior.
4. Add or update Minitest coverage in `test/` for default behavior and
   rollout behavior. Run via `bundle exec rake test` or
   `ruby -Ilib -Itest test/<name>_test.rb`.
5. Update README or local gem docs when the flag is user-facing.

## Boolean Flags

Use `TinyFlags::BooleanFlag.new(default: false)` for a disabled-by-default
feature.

Use `TinyFlags::BooleanFlag.new(default: false, rollout: 10)` for a percentage
rollout. Rollout bucketing is deterministic by `:user_id`, `:account_id`, or
`:session_id` from the evaluation context Hash.

## Variant Flags

Use `TinyFlags::VariantFlag.new(variants: %w[classic semantic], default: "classic")`
when the call site needs a named treatment instead of `true`/`false`.

Use `rollout:` to allocate traffic:

```ruby
TinyFlags::VariantFlag.new(
  variants: %w[classic semantic],
  default: "classic",
  rollout: { "semantic" => 10 }
)
```

## Done Criteria

- New flag has an explicit `default:` keyword argument.
- Rollout percentage is an `Integer` from 0 to 100 (not `Float`, not boolean).
- Variant rollouts reference only declared variants.
- Minitest tests cover default behavior and at least one rollout boundary.
- Dead conditional branches are not introduced.
