---
name: perl-cpan-tinyflags-rollout-review
description: Review TinyFlags flag definitions and call sites for safe Perl rollouts.
---

# TinyFlags Rollout Review

Use this skill before increasing rollout percentages or shipping a new
TinyFlags-backed behavior in a Perl distribution.

## Review Checklist

- Every flag has an explicit `default` keyword argument.
- Boolean rollouts use integer values from 0 to 100.
- Variant rollout totals do not exceed 100.
- Unknown variants are not referenced in rollout mappings.
- Evaluation contexts include a stable `user_id`, `account_id`, or
  `session_id` key.
- `Test::More` cases exercise both default and rollout-allocated paths.
- No code path assumes rollout bucketing is random per request.

## Perl Details

Check `use` lines at the top of files that construct flag definitions:

```perl
use AgentXM::Examples::TinyFlags;
# BooleanFlag, VariantFlag, and Registry are inner packages — loading the
# parent module is enough.

my $flags = AgentXM::Examples::TinyFlags::Registry->new({
    'checkout-redesign' =>
        AgentXM::Examples::TinyFlags::BooleanFlag->new(
            default => 0, rollout => 10,
        ),
});
```

Pass evaluation context as a plain hashref with string keys
(`{ user_id => $user->id }`). Avoid building contexts ad hoc at every call
site; thread a single context through the request boundary.

Rollout changes should be small and reviewable. If a rollout moves from 0 to
100, confirm the disabled path can be deleted or explain why the flag remains
temporary.
