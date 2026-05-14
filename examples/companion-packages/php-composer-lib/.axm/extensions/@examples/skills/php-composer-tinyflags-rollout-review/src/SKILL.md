---
name: php-composer-tinyflags-rollout-review
description: Review TinyFlags flag definitions and call sites for safe PHP rollouts.
---

# TinyFlags Rollout Review

Use this skill before increasing rollout percentages or shipping a new
TinyFlags-backed behavior in a Composer PHP package.

## Review Checklist

- Every flag has an explicit default.
- Boolean rollouts use integers from 0 to 100.
- Variant rollout totals do not exceed 100.
- Unknown variants are not referenced in rollout maps.
- `EvaluationContext` instances carry a stable `userId`, `accountId`, or
  `sessionId`.
- Tests use PHPUnit and live under `tests/` with a matching PSR-4 namespace.
- No code path assumes rollout bucketing is random per request — it is
  deterministic per context bucket key.

## PHP Details

Check that consumers import classes from the `AgentXM\Examples\TinyFlags`
namespace, and prefer constructor injection of a single `Flags` instance over
ad-hoc creation at call sites:

```php
use AgentXM\Examples\TinyFlags\BooleanFlag;
use AgentXM\Examples\TinyFlags\Flags;
use AgentXM\Examples\TinyFlags\VariantFlag;

$flags = Flags::create([
    'feature-x' => BooleanFlag::of(['default' => false, 'rollout' => 10]),
]);
```

Rollout changes should be small and reviewable. If a rollout moves from 0 to
100, confirm the disabled path can be deleted or explain why the flag remains
temporary.
