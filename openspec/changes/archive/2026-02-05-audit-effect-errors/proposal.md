## Why

The effect-errors skill defines patterns for typed error handling in Effect. Two helper functions in the codebase throw raw errors instead of returning typed Effects, violating the "never throw in helpers" rule.

## What Changes

- Refactor `getSourcePath()` in `workspace/apply.ts` to return `Effect<string, ApplyError>` instead of throwing
- Refactor throw inside `getTreeSha()` in `extensions/skills/git.ts` to use typed `GitError` instead of raw `Error`

## Capabilities

### New Capabilities

None - this is a refactoring to align with existing conventions.

### Modified Capabilities

None - no spec-level behavior changes, only internal implementation fixes.

## Impact

- `packages/cli/src/workspace/apply.ts` - `getSourcePath()` function and its call sites
- `packages/cli/src/extensions/skills/git.ts` - `getTreeSha()` function internals
