---
name: npm-javascript-tinyflags-rollout-review
description: Review TinyFlags flag definitions and call sites for safe JavaScript rollouts.
---

# TinyFlags Rollout Review

Use this skill before increasing rollout percentages or shipping a new
TinyFlags-backed behavior in an npm JavaScript package.

## Review Checklist

- Every flag has an explicit default.
- Boolean rollouts use integers from 0 to 100.
- Variant rollout totals do not exceed 100.
- Unknown variants are not referenced in rollout maps.
- Evaluation contexts include a stable `userId`, `accountId`, or `sessionId`.
- Tests use Node's built-in `node:test` runner or the package's existing test
  runner.
- No code path assumes rollout bucketing is random per request.

## JavaScript Details

Check ES module imports from `@agentxm/example-tinyflags` and avoid introducing
CommonJS interop unless the package already uses it. Prefer named exports:

```js
import { booleanFlag, createFlags, variantFlag } from "@agentxm/example-tinyflags";
```

Rollout changes should be small and reviewable. If a rollout moves from 0 to
100, confirm the disabled path can be deleted or explain why the flag remains
temporary.
