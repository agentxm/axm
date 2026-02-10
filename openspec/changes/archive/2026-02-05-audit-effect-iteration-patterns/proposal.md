## Why

We just updated CLAUDE.md and effect-iteration skill guidance to identify `for` + `yield*` + `push` as an anti-pattern that misses parallelization opportunities. An audit found 7 locations in the codebase that violate this guidance, representing missed performance improvements for I/O-bound operations.

## What Changes

- Refactor 7 functions to use `Effect.forEach` with `{ concurrency: "unbounded" }` instead of sequential for loops
- Remove mutable array patterns (`const results = []; ... results.push(...)`)
- Preserve 3 legitimate exceptions where sequential execution is required by design

### Files to refactor:

1. **`cli-commands/skills/install/handler.ts`** (lines 259-300)
   - `createBuildIdealDeps.discoverSkills`: fetches GitHub tree hashes sequentially
   - Each API call is independent - parallelize

2. **`workspace/apply.ts`** (lines 415-444)
   - `copyDirectory`: copies files sequentially
   - Each file copy is independent - parallelize

3. **`workspace/apply.ts`** (lines 482-522)
   - `syncToAgents`: syncs to agents sequentially
   - Each agent sync is independent - parallelize

4. **`workspace/apply.ts`** (lines 536-551)
   - `removeFromAgents`: removes from agents sequentially
   - Each agent removal is independent - parallelize

5. **`resolution/resolvers/local-path.ts`** (lines 101-133)
   - `scanDirectory`: checks file existence sequentially
   - Each existence check is independent - parallelize

6. **`sources/wellknown/fetch.ts`** (lines 116-171)
   - `fetchSkillFiles`: fetches and writes files sequentially
   - Each file fetch is independent - parallelize

7. **`extensions/skills/wellknown.ts`** (lines 336-391)
   - `fetchSkillFiles`: duplicate pattern of #6
   - Each file fetch is independent - parallelize

### Exceptions (no change needed):

- `apply.ts:315-329` - `applyPlan` needs early break on failure
- `display.ts:161-163` - ordered console output required
- `detection.ts:61-66` - early return on first match

## Capabilities

### New Capabilities

None - this is a refactoring change with no new features.

### Modified Capabilities

None - behavior remains identical, only performance improves.

## Impact

- **Performance**: I/O-bound operations (file system, HTTP) will run concurrently
- **Code**: 7 functions across 5 files refactored
- **Risk**: Low - each refactoring is isolated and behavior-preserving
- **Testing**: Existing tests should pass without modification
