---
name: composer-tinyflags-add-flag
description: Add a TinyFlags flag to a Composer PHP project with implementation, tests, and rollout notes.
---

# Add TinyFlags Flag

Use this skill when adding a feature flag to a Composer PHP project that uses
`agentxm/example-tinyflags`.

## Workflow

1. Find the module that constructs the TinyFlags evaluator with `Flags::create`.
2. Add the flag with `BooleanFlag::of(...)` or `VariantFlag::of(...)`.
3. Prefer `kebab-case` keys in flag names (consistent with the cross-ecosystem
   convention) and `SCREAMING_SNAKE_CASE` constants for those keys in PHP.
4. Add or update PHPUnit coverage for default behavior and rollout behavior.
5. Update README or local package docs when the flag is user-facing.

## Boolean Flags

Use `BooleanFlag::of(['default' => false])` for a disabled-by-default feature.

Use `BooleanFlag::of(['default' => false, 'rollout' => 10])` for a percentage
rollout. The rollout is deterministic by `userId`, `accountId`, or
`sessionId` on the evaluation context.

## Variant Flags

Use `VariantFlag::of(['classic', 'semantic'], ['default' => 'classic'])` when
the call site needs a named treatment instead of `true` / `false`.

Use `rollout` to allocate traffic:

```php
VariantFlag::of(['classic', 'semantic'], [
    'default' => 'classic',
    'rollout' => ['semantic' => 10],
]);
```

## Done Criteria

- New flag has an explicit default.
- Rollout percentage is an integer from 0 to 100.
- Variant rollouts reference only declared variants.
- Tests cover default behavior and at least one rollout boundary.
- Dead conditional branches are not introduced.
