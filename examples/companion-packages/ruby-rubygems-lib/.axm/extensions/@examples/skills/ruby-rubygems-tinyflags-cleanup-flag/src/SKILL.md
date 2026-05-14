---
name: ruby-rubygems-tinyflags-cleanup-flag
description: Remove a stale TinyFlags flag and simplify Ruby call sites.
---

# Cleanup TinyFlags Flag

Use this skill when a TinyFlags flag has reached its final treatment and should
be removed from a Ruby gem.

## Workflow

1. Identify the final behavior: enabled, disabled, or a specific variant.
2. Replace `flags.enabled?(...)`, `flags.variant(...)`, and `flags.evaluate(...)`
   call sites with the final behavior.
3. Delete the flag entry from the `TinyFlags::Registry.new(...)` definitions
   Hash.
4. Remove Minitest cases that only exercise obsolete rollout branching.
5. Add or update tests for the final simplified behavior.
6. Search for the flag name (string and symbol form) in `lib/`, `test/`,
   README files, and gemspec metadata.

## Guardrails

- Do not leave a deleted flag referenced in a string literal or
  `:symbol_name`.
- Do not keep rollout-specific tests after the rollout branch is gone.
- Preserve public API compatibility unless the gem release notes explicitly
  call out a breaking change.
- Keep Ruby style consistent with the gem; if the project uses
  `# frozen_string_literal: true`, retain it on edited files.
