---
name: scala-maven-tinyflags-add-flag
description: Add a TinyFlags flag to a Maven Scala project with implementation, tests, and rollout notes.
---

# Add TinyFlags Flag

Use this skill when adding a feature flag to a Maven Scala project that
uses `ai.agentxm.examples:tinyflags-scala_3`.

## Workflow

1. Find the file or `object` that builds the `Flags` bundle with
   `createFlags(...)` or `Flags.of(...)`.
2. Add the flag with `booleanFlag(...)` or `variantFlag(...)`.
3. Prefer camelCase Scala identifiers for the local constant and
   kebab-case string keys (the public flag name passed at evaluation time).
4. Add or update MUnit coverage (`FunSuite`) for default behavior and
   rollout behavior.
5. Update README or local module docs when the flag is user-facing.

## Boolean Flags

Use `booleanFlag(default = false)` for a disabled-by-default feature.

Use `booleanFlag(default = false, rollout = Some(10))` for a percentage
rollout. The rollout is deterministic by `Context(id)`.

## Variant Flags

Use a variant flag when the call site needs a named treatment:

```scala
variantFlag(
  variants = List("classic", "semantic"),
  default = Some("classic"),
  rollout = Some(Map("semantic" -> 10)),
)
```

## Done Criteria

- New flag has an explicit default.
- Rollout percentage is an integer from 0 to 100.
- Variant rollouts reference only declared variants.
- MUnit suites cover default behavior and at least one rollout boundary.
- Dead conditional branches are not introduced.
- `mvn test` passes.
