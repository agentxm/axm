> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Add `baseDir` to WorkspaceContextService

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 Add `readonly baseDir: string` property to `WorkspaceContextService` interface and implementation in `packages/cli/src/workspace/service.ts`, computed as `path.dirname(this.path)`
- [ ] 1.2 Update tests for `WorkspaceContextService` to verify `baseDir` returns the parent of `path`
- [ ] 1.3 Migrate all ~21 callsites that compute `path.dirname(ws.path)` or `path.dirname(axmDir)` to use `ws.baseDir` — update production code only (test mocks in next step)
- [ ] 1.4 Update test mocks/fixtures that construct `WorkspaceContextService` to include `baseDir`
- [ ] 1.5 Run `pnpm typecheck` — fix any errors
- [ ] 1.6 Run `pnpm lint` — fix any errors
- [ ] 1.7 Run `pnpm test` — fix any failures
- [ ] 1.8 Run `pnpm test:e2e` — fix any failures
- [ ] 1.9 Kill any remaining vitest worker processes

## 2. Extract helpers: `validatePathSafety` and `preCleanAndCopy`

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

- [ ] 2.1 Write tests for `validatePathSafety(baseDir, targetPath)` — returns `Effect.void` when safe, fails with `INSTALL_SKILL_PATH_TRAVERSAL` when unsafe
- [ ] 2.2 Implement `validatePathSafety` in `install-skill.ts` wrapping `isPathSafe` + `makeCliError`
- [ ] 2.3 Write tests for `preCleanAndCopy(sanitizedName, sourcePath, copyTarget)` — yields `Workspace`, `FileSystem`, `Path`; calls `removeFromAllCanonicalLocations` then `copySkillDirectory`
- [ ] 2.4 Implement `preCleanAndCopy` in `install-skill.ts`
- [ ] 2.5 Run `pnpm typecheck` — fix any errors
- [ ] 2.6 Run `pnpm lint` — fix any errors
- [ ] 2.7 Run `pnpm test` — fix any failures
- [ ] 2.8 Run `pnpm test:e2e` — fix any failures
- [ ] 2.9 Kill any remaining vitest worker processes

## 3. Extract per-refType install functions and refactor `installSkill`

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2

- [ ] 3.1 Write/update tests for `installFromGitHosted` — validates path safety, calls `preCleanAndCopy` with `skillSrcPath` as target, returns `MaterializedSkill` with `versionConstraint: Option.none()`
- [ ] 3.2 Implement `installFromGitHosted`
- [ ] 3.3 Write/update tests for `installFromLocal` — validates path safety, detects self-copy (skips when source === skillSrcPath), returns `MaterializedSkill` with `versionConstraint: Option.none()`
- [ ] 3.4 Implement `installFromLocal`
- [ ] 3.5 Write/update tests for `installFromBuiltin` — validates path safety, fetches via `SourceHostProviders`, calls `preCleanAndCopy`, returns `MaterializedSkill` with `versionConstraint: Option.none()`
- [ ] 3.6 Implement `installFromBuiltin` and `fetchSource` helper
- [ ] 3.7 Write/update tests for `installFromRegistry` — validates path safety, handles empty-integrity (use existing canonical), fetches archive via registry client, verifies integrity (fails with `INSTALL_SKILL_INTEGRITY_MISMATCH` on mismatch), extracts to tmp dir, calls `preCleanAndCopy` with `canonicalPath` as target, returns `MaterializedSkill` with passed-through `versionConstraint`
- [ ] 3.8 Implement `installFromRegistry`
- [ ] 3.9 Refactor `installSkill` to use `switch(ref.refType)` dispatch producing `MaterializedSkill`, then shared post-install steps (agent symlinks, lockfile/settings, result)
- [ ] 3.10 Rename `installForAgent` param `canonicalPath` → `canonicalSkillSrcPath`, remove `base` param, yield `Workspace` for `ws.baseDir` instead
- [ ] 3.11 Remove `getRefLocation` helper (no longer needed)
- [ ] 3.12 Run `pnpm typecheck` — fix any errors
- [ ] 3.13 Run `pnpm lint` — fix any errors
- [ ] 3.14 Run `pnpm test` — fix any failures
- [ ] 3.15 Run `pnpm test:e2e` — fix any failures
- [ ] 3.16 Kill any remaining vitest worker processes

## 4. Final verification

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 3

- [ ] 4.1 Run `pnpm typecheck` — confirm clean across all packages
- [ ] 4.2 Run `pnpm lint` — confirm clean across all packages
- [ ] 4.3 Run `pnpm test` — confirm all tests pass
- [ ] 4.4 Run `pnpm test:e2e` — confirm all e2e tests pass
- [ ] 4.5 Kill any remaining vitest worker processes
