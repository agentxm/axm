---
name: perl-cpan-tinyflags-add-flag
description: Add a TinyFlags flag to a Perl distribution with implementation, tests, and rollout notes.
---

# Add TinyFlags Flag

Use this skill when adding a feature flag to a Perl project that uses
`AgentXM::Examples::TinyFlags`.

## Workflow

1. Find the Perl module that constructs the
   `AgentXM::Examples::TinyFlags::Registry` from its definitions hashref
   (typically `lib/<Dist>/Flags.pm` or similar).
2. Add the flag as an `AgentXM::Examples::TinyFlags::BooleanFlag->new(...)`
   or `AgentXM::Examples::TinyFlags::VariantFlag->new(...)` entry.
3. Prefer `kebab-case` flag names that mirror the call-site behavior.
4. Add or update `Test::More` coverage in `t/` for default behavior and
   rollout behavior. Run via `prove -Ilib -lvr t` or `make test`.
5. Update the dist README or POD when the flag is user-facing.

## Boolean Flags

Use `AgentXM::Examples::TinyFlags::BooleanFlag->new(default => 0)` for a
disabled-by-default feature.

Use `AgentXM::Examples::TinyFlags::BooleanFlag->new(default => 0, rollout => 10)`
for a percentage rollout. Bucketing is deterministic by `user_id`,
`account_id`, or `session_id` keys (in that order) of the evaluation
context hashref.

## Variant Flags

Use
`AgentXM::Examples::TinyFlags::VariantFlag->new(variants => [qw(classic semantic)], default => 'classic')`
when the call site needs a named treatment instead of true/false.

Use `rollout` to allocate traffic:

```perl
AgentXM::Examples::TinyFlags::VariantFlag->new(
    variants => [qw(classic semantic)],
    default  => 'classic',
    rollout  => { semantic => 10 },
);
```

## Done Criteria

- New flag has an explicit `default` keyword argument.
- Rollout percentage is an integer from 0 to 100.
- Variant rollouts reference only declared variants.
- `Test::More` cases cover default behavior and at least one rollout boundary.
- Dead conditional branches are not introduced.
