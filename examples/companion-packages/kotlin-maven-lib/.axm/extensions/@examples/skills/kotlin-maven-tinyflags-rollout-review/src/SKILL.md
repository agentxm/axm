---
name: kotlin-maven-tinyflags-rollout-review
description: Review TinyFlags flag definitions and call sites for safe Kotlin rollouts.
---

# TinyFlags Rollout Review

Use this skill before increasing rollout percentages or shipping a new
TinyFlags-backed behavior in a Maven Kotlin package.

## Review Checklist

- Every flag has an explicit default.
- Boolean rollouts use integers from 0 to 100.
- Variant rollout totals do not exceed 100.
- Unknown variants are not referenced in rollout maps.
- Evaluation contexts use a stable `Context(id)` (user id, account id,
  or session id) — anonymous callers share one bucket.
- Kotest specs cover default behavior, rollout boundaries, and validation
  failures.
- No code path assumes rollout bucketing is random per request.

## Kotlin Details

Check imports from `ai.agentxm.examples.tinyflags` and keep flag tables
data-first:

```kotlin
import ai.agentxm.examples.tinyflags.booleanFlag
import ai.agentxm.examples.tinyflags.createFlags

val flags = createFlags(
    "checkoutRedesign" to booleanFlag(default = false, rollout = 10),
)
```

Rollout changes should be small and reviewable. If a rollout moves from 0
to 100, confirm the disabled branch can be deleted or explain why the
flag stays temporary.
