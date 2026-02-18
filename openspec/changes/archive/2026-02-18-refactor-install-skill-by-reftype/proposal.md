## Why

The current `installSkill` handler interleaves ref-type-specific logic (source resolution, path computation, copy targets, self-copy detection) with shared orchestration (symlinks, lockfile, settings). Conditionals like `ref.refType === "registry"` are scattered across the function body, making it hard to reason about what each ref type actually does. A `switch(ref.refType)` architecture makes each installation path self-contained and readable top-to-bottom.

## What Changes

- Restructure `installSkill` around an explicit `switch(ref.refType)` dispatch so each case (`git-hosted`, `registry`, `local`, `builtin`) contains its own install pipeline
- Extract shared post-install steps (agent symlinks, lockfile/settings writes) into a reusable helper that each case calls after materializing files
- Remove interleaved conditionals (`useExistingCanonical`, `isSelfCopy`, `pathSource` ternaries) in favor of per-case logic that reads linearly
- The external contract (operation handler signature, `OperationResult` return) stays the same — only internal structure changes

## Capabilities

### New Capabilities

_(none — this is a pure internal refactor)_

### Modified Capabilities

- `skills-install-execute`: The orchestration structure changes from interleaved conditionals to per-refType dispatch. The registry case additionally changes from `SourceHostProviders.fetch` to direct registry client usage (fetch archive, verify integrity, extract). Other behavioral requirements (path safety, symlink fallback, lockfile/settings writes, concurrency) remain the same but the spec should reflect the new dispatch architecture.

## Impact

- `packages/cli/src/cli-commands/skills/install/install-skill.ts` — primary rewrite target
- `packages/cli/src/cli-commands/skills/install/install-skill.test.ts` — tests may need structural updates to match new internal organization
- `packages/cli/src/workspace/service.ts` — add `baseDir` property to `WorkspaceContextService`
- ~21 callsites across the codebase that compute `path.dirname(ws.path)` — migrate to `ws.baseDir`
