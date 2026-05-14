---
name: java-maven-tinyflags-add-flag
description: Add a TinyFlags flag to a Maven Java project with implementation, tests, and rollout notes.
---

# Add TinyFlags Flag

Use this skill when adding a feature flag to a Maven Java project that depends
on `ai.agentxm.examples:tinyflags-java`.

## Workflow

1. Find the class or method that builds the `TinyFlags` instance via
   `TinyFlags.builder()`.
2. Register the new flag with `.booleanFlag(...)` or `.variantFlag(...)`.
3. Prefer kebab-case flag keys to match the rest of the codebase. Java
   identifiers for the constant should be `SCREAMING_SNAKE_CASE`.
4. Add or update JUnit 5 coverage for default behavior and rollout behavior.
5. Update README or local package docs when the flag is user-facing.

## Boolean Flags

Use a disabled-by-default boolean flag:

```java
.booleanFlag("checkoutRedesign", false)
```

Use a percentage rollout — the rollout is deterministic by `userId`,
`accountId`, or `sessionId`:

```java
.booleanFlag("checkoutRedesign", false, 10)
```

## Variant Flags

Use a variant flag when the call site needs a named treatment:

```java
.variantFlag(
    "searchRanking",
    List.of("classic", "semantic"),
    "classic",
    Map.of("semantic", 10))
```

## Done Criteria

- New flag has an explicit default.
- Rollout percentage is an integer from 0 to 100.
- Variant rollouts reference only declared variants.
- JUnit 5 tests cover default behavior and at least one rollout boundary.
- Dead conditional branches are not introduced.
- `mvn test` passes.
