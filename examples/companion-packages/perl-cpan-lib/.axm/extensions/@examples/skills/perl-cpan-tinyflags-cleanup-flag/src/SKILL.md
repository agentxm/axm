---
name: perl-cpan-tinyflags-cleanup-flag
description: Remove a stale TinyFlags flag and simplify Perl call sites.
---

# Cleanup TinyFlags Flag

Use this skill when a TinyFlags flag has reached its final treatment and
should be removed from a Perl distribution.

## Workflow

1. Identify the final behavior: enabled, disabled, or a specific variant.
2. Replace `$flags->enabled(...)`, `$flags->variant(...)`, and
   `$flags->evaluate(...)` call sites with the final behavior.
3. Delete the flag entry from the
   `AgentXM::Examples::TinyFlags::Registry->new(...)` definitions hashref.
4. Remove `Test::More` cases that only exercise obsolete rollout branching.
5. Add or update tests for the final simplified behavior.
6. Search for the flag name (string and constant form) in `lib/`, `t/`,
   README files, POD, and `META.json` / `Makefile.PL` metadata.

## Guardrails

- Do not leave a deleted flag referenced in a string literal or constant.
- Do not keep rollout-specific tests after the rollout branch is gone.
- Preserve public API compatibility unless the distribution release notes
  explicitly call out a breaking change.
- Keep Perl style consistent with the distribution; if the project uses
  `use strict; use warnings;` everywhere, retain those on edited files.
