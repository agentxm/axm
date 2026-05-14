---
name: haskell-hackage-tinyflags-rollout-review
description: Review TinyFlags flag definitions and call sites for safe Haskell rollouts.
---

# TinyFlags Rollout Review

Use this skill before increasing rollout percentages or shipping a new
TinyFlags-backed behavior in a Haskell package.

## Review Checklist

- Every flag has an explicit default passed to `booleanFlag` /
  `variantFlag`.
- Boolean rollouts use `Int` values from 0 to 100.
- Variant rollout totals do not exceed 100.
- Unknown variants are not referenced in rollout lists.
- Evaluation contexts pass a stable `ctxUserId`, `ctxAccountId`, or
  `ctxSessionId` (not request-scoped values).
- Hspec specs exercise both default and rollout-allocated paths.
- No code path assumes rollout bucketing is random per request.

## Haskell Details

Imports should be qualified or explicit at construction sites:

```haskell
import AgentXM.Example.TinyFlags
  ( BooleanFlag, VariantFlag, Flag (..), Context (..)
  , booleanFlag, variantFlag, registry, enabled, variant
  )
```

Pass `Context` through the request boundary as a value, not as a global.
Prefer one helper that builds the `Context` (with `ctxUserId` populated
from the authenticated user) and thread it into call sites.

Rollout changes should be small and reviewable. If a rollout moves from
0 to 100, confirm the disabled path can be deleted or explain why the
flag remains temporary.

Watch for `Right`-only pattern matches on the smart-constructor results
during review — these silently swallow `TinyFlagsError` and should fail
loudly during construction instead.
