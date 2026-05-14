---
name: dart-pub-tinyflags-add-flag
description: Add a TinyFlags flag to a Pub Dart project with implementation, tests, and rollout notes.
---

# Add TinyFlags Flag

Use this skill when adding a feature flag to a Dart project that uses
`agentxm_example_tinyflags`.

## Workflow

1. Find the Dart file that constructs the `TinyFlags` instance from its
   definition map.
2. Add the flag as a `BooleanFlag` or `VariantFlag` entry keyed by a stable
   string.
3. Prefer `kebab-case` flag keys (consistent with the cross-ecosystem examples).
4. Add or update `package:test` coverage for default behavior and rollout
   behavior.
5. Update README or local package docs when the flag is user-facing.

## Boolean Flags

Use `BooleanFlag(defaultValue: false)` for a disabled-by-default feature.

Use `BooleanFlag(defaultValue: false, rollout: 10)` for a percentage rollout.
The rollout is deterministic by `userId`, `accountId`, or `sessionId` from the
`FlagContext`.

## Variant Flags

Use `VariantFlag(variants: ['classic', 'semantic'], defaultValue: 'classic')`
when the call site needs a named treatment instead of `true` or `false`.

Use `rollout` to allocate traffic:

```dart
VariantFlag(
  variants: ['classic', 'semantic'],
  defaultValue: 'classic',
  rollout: {'semantic': 10},
);
```

## Done Criteria

- New flag has an explicit `defaultValue`.
- Rollout percentage is an `int` from 0 to 100.
- Variant rollouts reference only declared variants.
- Tests cover default behavior and at least one rollout boundary.
- Dead conditional branches are not introduced.
