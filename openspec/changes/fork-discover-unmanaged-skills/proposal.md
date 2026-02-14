## Why

`axm skills fork "<glob>"` currently matches only lockfile-installed skill names, so users cannot glob unmanaged local skills that exist on disk or are configured but not lock-installed. This makes fork behavior inconsistent with user expectations and blocks common migration/customization workflows.

## What Changes

- Expand `axm skills fork <source>` glob-source behavior to discover candidate skills from more than lockfile entries.
- Include unmanaged configured skills as glob candidates when resolving `source` patterns.
- Include unmanaged skills present on disk in configured agent skill directories as glob candidates.
- Keep explicit non-glob source behavior unchanged (installed skill name, local path, GitHub source, etc.).
- Update mismatch errors to report available candidates from the broader discovery set.
- **BREAKING**: Glob source matching for `skills fork` is no longer limited to installed lockfile skills.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `skills-fork`: Change glob-source discovery requirements to include unmanaged configured and on-disk skills, not only locked installed skills.
- `cli-skills-fork`: Change CLI-level matching and user-facing error semantics for glob sources to reflect expanded discovery.

## Impact

- Affected code: `packages/cli/src/cli-commands/skills/fork/handler.ts`, workspace skill discovery helpers, and fork command tests.
- Affected tests: `packages/cli/src/cli-commands/skills/fork/handler.test.ts`, `packages/cli/src/cli-commands/skills/fork/fork.e2e.test.ts`.
- User-visible behavior: `axm skills fork "pattern"` can match unmanaged skills available in workspace configuration or agent skill directories.
