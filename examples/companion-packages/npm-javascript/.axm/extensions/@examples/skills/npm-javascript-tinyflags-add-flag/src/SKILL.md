---
name: npm-javascript-tinyflags-add-flag
description: Add a TinyFlags flag to an npm JavaScript project with implementation, tests, and rollout notes.
---

# Add TinyFlags Flag

Use this skill when adding a feature flag to an npm JavaScript project that uses
`@agentxm/tinyflags`.

## Workflow

1. Find the module that creates the TinyFlags client with `createFlags`.
2. Add the flag with `booleanFlag` or `variantFlag`.
3. Prefer camelCase flag keys in JavaScript source.
4. Add or update `node:test` coverage for default behavior and rollout
   behavior.
5. Update README or local package docs when the flag is user-facing.

## Boolean Flags

Use `booleanFlag({ default: false })` for a disabled-by-default feature.

Use `booleanFlag({ default: false, rollout: 10 })` for a percentage rollout.
The rollout is deterministic by `userId`, `accountId`, or `sessionId`.

## Variant Flags

Use `variantFlag(["classic", "semantic"], { default: "classic" })` when the
call site needs a named treatment instead of true or false.

Use `rollout` to allocate traffic:

```js
variantFlag(["classic", "semantic"], {
  default: "classic",
  rollout: { semantic: 10 },
});
```

## Done Criteria

- New flag has an explicit default.
- Rollout percentage is an integer from 0 to 100.
- Variant rollouts reference only declared variants.
- Tests cover default behavior and at least one rollout boundary.
- Dead conditional branches are not introduced.
