# Change: Align Effect patterns with documented conventions

## Why

The codebase uses Effect for all business logic but has minor inconsistencies with
the documented conventions in `/effect-basics`, `/effect-service`, `/effect-testing`,
and `/effect-wrapping` skills. A comprehensive audit found 7 specific gaps affecting
consistency, resilience, and maintainability.

## What Changes

- Add `retryable: boolean` field to all error types (6 error classes)
- Add `Effect.retry()` policy to network operations in wellknown.ts
- Parallelize skill installation loop with `Effect.all()` in add handler
- Convert test helper `.then()` chain to async/await in source-parser.test.ts
- Add `cause` field to validation error paths (1 handler)
- Standardize error mapping style across handlers (documentation task)

## Impact

- Affected specs: None (internal implementation, no user-facing behavior change)
- Affected code:
  - `packages/cli/src/commands/init/handler.ts` - add retryable, cause fields
  - `packages/cli/src/commands/skills/add/handler.ts` - add retryable, parallelize loop
  - `packages/core/src/experimental/skills/skill-discovery.ts` - add retryable field
  - `packages/core/src/experimental/skills/installer.ts` - add retryable field
  - `packages/core/src/experimental/skills/content-hash.ts` - add retryable field
  - `packages/core/src/experimental/skills/lockfile.ts` - add retryable fields
  - `packages/core/src/experimental/skills/wellknown.ts` - add retry policy
  - `packages/core/src/experimental/skills/source-parser.test.ts` - convert test helper
