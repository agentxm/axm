---
name: maven-kotlin-tinyflags-add-flag
description: Add a TinyFlags flag to a Maven Kotlin project with implementation, tests, and rollout notes.
---

# Add TinyFlags Flag

Use this skill when adding a feature flag to a Maven Kotlin project that
uses `ai.agentxm.examples:tinyflags-kotlin`.

## Workflow

1. Find the file or object that builds the `Flags` bundle with
   `createFlags(...)` or `Flags.of(...)`.
2. Add the flag with `booleanFlag(...)` or `variantFlag(...)`.
3. Prefer camelCase Kotlin property names and kebab-case flag string keys
   (the public flag name passed at evaluation time).
4. Add or update Kotest coverage (`StringSpec` or `FunSpec`) for default
   behavior and rollout behavior.
5. Update README or local module docs when the flag is user-facing.

## Boolean Flags

Use `booleanFlag(default = false)` for a disabled-by-default feature.

Use `booleanFlag(default = false, rollout = 10)` for a percentage rollout.
The rollout is deterministic by `Context(id)`.

## Variant Flags

Use a variant flag when the call site needs a named treatment:

```kotlin
variantFlag(
    variants = listOf("classic", "semantic"),
    default = "classic",
    rollout = mapOf("semantic" to 10),
)
```

## Done Criteria

- New flag has an explicit default.
- Rollout percentage is an integer from 0 to 100.
- Variant rollouts reference only declared variants.
- Kotest specs cover default behavior and at least one rollout boundary.
- Dead conditional branches are not introduced.
