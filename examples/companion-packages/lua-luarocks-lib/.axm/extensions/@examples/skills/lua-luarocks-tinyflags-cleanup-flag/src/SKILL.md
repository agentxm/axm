---
name: lua-luarocks-tinyflags-cleanup-flag
description: Remove a stale TinyFlags flag and simplify Lua call sites.
---

# Cleanup TinyFlags Flag

Use this skill when a TinyFlags flag has reached its final treatment and
should be removed from a Lua rock.

## Workflow

1. Identify the final behavior: enabled, disabled, or a specific variant.
2. Replace `flags:is_enabled(...)`, `flags:variant(...)`, and
   `flags:evaluate(...)` call sites with the final behavior.
3. Delete the flag entry from the `tinyflags.Registry({...})` definitions
   table.
4. Remove busted specs that only exercise obsolete rollout branching.
5. Add or update specs for the final simplified behavior.
6. Search for the flag name (as a string literal and as a table key) in
   `src/`, `spec/`, README files, and the rockspec.

## Guardrails

- Do not leave a deleted flag referenced in a string literal.
- Do not keep rollout-specific specs after the rollout branch is gone.
- Preserve public API compatibility unless the rock release notes explicitly
  call out a breaking change.
- Keep Lua style consistent with the host rock (table-constructor style,
  `local function` vs module table conventions).
