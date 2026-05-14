---
name: ruby-rubygems-tinyflags-rollout-review
description: Review TinyFlags flag definitions and call sites for safe Ruby rollouts.
---

# TinyFlags Rollout Review

Use this skill before increasing rollout percentages or shipping a new
TinyFlags-backed behavior in a Ruby gem.

## Review Checklist

- Every flag has an explicit `default:` keyword argument.
- Boolean rollouts use `Integer` values from 0 to 100 (not `Float`, not
  boolean).
- Variant rollout totals do not exceed 100.
- Unknown variants are not referenced in rollout mappings.
- Evaluation contexts include a stable `:user_id`, `:account_id`, or
  `:session_id` symbol key.
- Minitest specs exercise both default and rollout-allocated paths.
- No code path assumes rollout bucketing is random per request.

## Ruby Details

Check `require "tiny_flags"` (or the gem's own re-export) at the top of
files that construct flag definitions:

```ruby
require "tiny_flags"

TinyFlags::Registry.new(
  "checkout_redesign" => TinyFlags::BooleanFlag.new(default: false, rollout: 10)
)
```

Pass evaluation context as a plain Ruby Hash with symbol keys
(`{ user_id: current_user.id }`). Avoid building contexts ad hoc at every
call site; thread a single context through the request boundary.

Rollout changes should be small and reviewable. If a rollout moves from 0 to
100, confirm the disabled path can be deleted or explain why the flag remains
temporary.
