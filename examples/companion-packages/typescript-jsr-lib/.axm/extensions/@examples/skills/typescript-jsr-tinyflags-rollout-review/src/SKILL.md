---
name: typescript-jsr-tinyflags-rollout-review
description: Review TinyFlags flag definitions and call sites for safe Deno/TypeScript rollouts.
---

# TinyFlags Rollout Review

Use this skill before increasing rollout percentages or shipping a new
TinyFlags-backed behavior in a JSR (Deno) TypeScript package.

## Review Checklist

- Every flag has an explicit default.
- Boolean rollouts use integers from 0 to 100.
- Variant rollout totals do not exceed 100.
- Unknown variants are not referenced in rollout maps.
- Evaluation contexts include a stable `userId`, `accountId`, or `sessionId`.
- Tests use `Deno.test` and `jsr:@std/assert` (or the project's existing
  assertion library).
- No code path assumes rollout bucketing is random per request.

## TypeScript Details

Check imports from `@agentxm/example-tinyflags`. JSR imports must use the
`jsr:` URL scheme and pin an exact version so `axm discover` can produce a
versioned purl:

```ts
import { booleanFlag, tinyFlags, variantFlag } from "jsr:@agentxm/example-tinyflags@0.1.0";
```

Range specifiers (`^`, `~`, `>=`) degrade to a versionless purl and lose the
package-author recommendation link. Pin the exact version in `deno.json` and
in inline `jsr:` import specifiers.

Rollout changes should be small and reviewable. If a rollout moves from 0 to
100, confirm the disabled path can be deleted or explain why the flag remains
temporary.
