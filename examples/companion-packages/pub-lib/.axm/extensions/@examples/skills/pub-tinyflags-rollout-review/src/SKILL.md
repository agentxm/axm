---
name: pub-tinyflags-rollout-review
description: Review TinyFlags flag definitions and call sites for safe Dart rollouts.
---

# TinyFlags Rollout Review

Use this skill before increasing rollout percentages or shipping a new
TinyFlags-backed behavior in a Pub Dart package.

## Review Checklist

- Every flag has an explicit `defaultValue`.
- Boolean rollouts use `int` values from 0 to 100.
- Variant rollout totals do not exceed 100.
- Unknown variants are not referenced in rollout maps.
- Evaluation contexts include a stable `userId`, `accountId`, or `sessionId`.
- Tests use `package:test` and exercise both default and rollout-allocated
  paths.
- No code path assumes rollout bucketing is random per request.

## Dart Details

Check imports from `package:agentxm_example_tinyflags/agentxm_example_tinyflags.dart`:

```dart
import 'package:agentxm_example_tinyflags/agentxm_example_tinyflags.dart';
```

Pass evaluation context as a `FlagContext`. Avoid building contexts ad hoc at
every call site; thread a single context object through the request boundary.

Rollout changes should be small and reviewable. If a rollout moves from 0 to
100, confirm the disabled path can be deleted or explain why the flag remains
temporary.
