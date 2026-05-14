---
name: maven-java-tinyflags-rollout-review
description: Review TinyFlags flag definitions and call sites for safe Java rollouts.
---

# TinyFlags Rollout Review

Use this skill before increasing rollout percentages or shipping a new
TinyFlags-backed behavior in a Maven Java package.

## Review Checklist

- Every flag has an explicit default.
- Boolean rollouts use integers from 0 to 100.
- Variant rollout totals do not exceed 100.
- Unknown variants are not referenced in rollout maps.
- Evaluation contexts include a stable `userId`, `accountId`, or `sessionId`.
- JUnit 5 tests cover default behavior, rollout boundaries, and variant
  validation.
- No code path assumes rollout bucketing is random per request.

## Java Details

Check imports from `ai.agentxm.examples.tinyflags` and keep flag registration
in a single builder pipeline:

```java
TinyFlags flags = TinyFlags.builder()
    .booleanFlag("checkoutRedesign", false, 10)
    .build();
```

Rollout changes should be small and reviewable. If a rollout moves from 0 to
100, confirm the disabled branch can be deleted or explain why the flag
remains temporary. Run `mvn test` after every change.
