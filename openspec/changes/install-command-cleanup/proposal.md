## Why

The `skills install` command's production source files (`discover-skills.ts`, `parse-manifests.ts`, `skill-utils.ts`) use `node:path` and `node:os` directly, violating the project convention to use `@effect/platform` for all filesystem and path operations. Additionally, several minor code quality issues were identified: non-standard error cause typing, non-idiomatic array operations, and unnecessary type assertions.

## What Changes

- Migrate `discover-skills.ts` from `node:path` to `@effect/platform` `Path.Path` service for all path computation (`join`, `resolve`, `relative`)
- Migrate `parse-manifests.ts` from `node:path` to `@effect/platform` `Path.Path` service
- Migrate `skill-utils.ts` from `node:path` to `@effect/platform` `Path.Path` service (requires `getSkillDisplayName` to become effectful or accept a path parameter)
- Replace `node:os` `tmpdir()` in `discover-skills.ts` with an `@effect/platform` alternative or accept as a boundary exception
- Change `InstallError.cause` from `Option.Option<unknown>` to `cause: unknown` to match the standard `Data.TaggedError` pattern used elsewhere in the codebase
- Replace `.flat()` calls with `Array.flatten` from `effect/Array` in `discover-skills.ts`
- Remove unnecessary `as const` assertions in `build-plan.ts` where `satisfies` already constrains the type

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `cli-skills-install-discover-skills-dir`: Discovery functions gain `Path.Path` as a service dependency instead of using `node:path` directly
- `skills-install-build-plan`: Remove unnecessary type assertions
- `skills-install-execute`: `InstallError.cause` changes from `Option<unknown>` to `unknown`
- `cli-skills-install-post-discovery`: `getSkillDisplayName` changes signature to accept path dependency or becomes effectful

## Impact

- **Production code**: `discover-skills.ts`, `parse-manifests.ts`, `skill-utils.ts`, `build-plan.ts`, `handler.ts`
- **Test code**: All corresponding test files need updates for changed service dependencies and error shapes
- **Dependencies**: No new dependencies — `@effect/platform` is already used in `install-skill.ts`
- **Breaking**: None — all changes are internal implementation details with no public API surface
