---
name: lua-luarocks-tinyflags-rollout-review
description: Review TinyFlags flag definitions and call sites for safe Lua rollouts.
---

# TinyFlags Rollout Review

Use this skill before increasing rollout percentages or shipping a new
TinyFlags-backed behavior in a Lua rock.

## Review Checklist

- Every flag has an explicit `default = ...` keyword.
- Boolean rollouts use integer values from 0 to 100 (not floats, not
  booleans).
- Variant rollout totals do not exceed 100.
- Unknown variants are not referenced in rollout tables.
- Evaluation contexts include a stable `user_id`, `account_id`, or
  `session_id` field.
- busted specs exercise both default and rollout-allocated paths.
- No code path assumes rollout bucketing is random per request.

## Lua Details

Check `local tinyflags = require("tinyflags")` at the top of files that
construct flag definitions:

```lua
local tinyflags = require("tinyflags")

local flags = tinyflags.Registry({
  ["checkout-redesign"] = tinyflags.BooleanFlag({ default = false, rollout = 10 }),
})
```

Pass evaluation context as a plain Lua table (`{ user_id = current_user.id }`).
Avoid building contexts ad hoc at every call site; thread a single context
through the request boundary.

Rollout changes should be small and reviewable. If a rollout moves from 0 to
100, confirm the disabled path can be deleted or explain why the flag remains
temporary.
