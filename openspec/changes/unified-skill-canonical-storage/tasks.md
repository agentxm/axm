> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Constants and Path Computation

> **Subagent:** Run this entire phase in a single subagent.

No dependencies — this phase can start immediately.

- [ ] 1.1 Add `EXTERNAL_EXTENSIONS_DIR = ".axm/extensions/external"` constant to `packages/cli/src/cli-commands/skills/constants.ts`
- [ ] 1.2 Update `computeSkillPaths` in `packages/cli/src/cli-commands/skills/skill-paths.ts`: non-registry branch returns `<base>/.axm/extensions/external/skills/<sanitized-name>` for both `canonicalPath` and `skillSrcPath`
- [ ] 1.3 Update `SkillDirPaths` JSDoc in `skill-paths.ts` to reflect new non-registry paths
- [ ] 1.4 Update tests in `packages/cli/src/cli-commands/skills/skill-paths.test.ts` to expect new paths
- [ ] 1.5 Update `getInstalledSkillPath` in `packages/cli/src/sources/resolve-source.ts` to return `.axm/extensions/external/skills/<name>` for non-registry entries
- [ ] 1.6 Update `getSkillDir` tests in `packages/cli/src/workspace/service.test.ts` to expect new non-registry paths
- [ ] 1.7 Run `pnpm typecheck` and fix any errors
- [ ] 1.8 Run `pnpm lint` and fix any errors
- [ ] 1.9 Run `pnpm test` and fix any failures
- [ ] 1.10 Run `pnpm test:e2e` and fix any failures
- [ ] 1.11 Kill any vitest worker processes

## 2. Install Executor

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

- [ ] 2.1 Update `installForAgent` in `packages/cli/src/cli-commands/skills/install/install-skill.ts`: remove the self-reference detection block that skips symlink creation when `agentSkillsDir === canonicalSkillsDir`. All agents SHALL receive symlinks.
- [ ] 2.2 Update `preCleanAllLocations` in `install-skill.ts`: replace `.agents/skills/<name>` cleanup with `.axm/extensions/external/skills/<name>` cleanup. Keep `@`-scoped cleanup for registry locations.
- [ ] 2.3 Update handler tests in `packages/cli/src/cli-commands/skills/install/` to reflect new canonical paths and removal of self-reference skip
- [ ] 2.4 Run `pnpm typecheck` and fix any errors
- [ ] 2.5 Run `pnpm lint` and fix any errors
- [ ] 2.6 Run `pnpm test` and fix any failures
- [ ] 2.7 Run `pnpm test:e2e` and fix any failures
- [ ] 2.8 Kill any vitest worker processes

## 3. Disable Executor

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

> **Parallelization:** Phase 3 and Phase 2 are independent — can be launched as parallel subagents (both depend only on Phase 1).

- [ ] 3.1 Rewrite `disableSkill` in `packages/cli/src/cli-commands/skills/disable/disable-skill.ts`: remove canonical directory deletion (lines removing from `UNIVERSAL_SKILLS_DIR` and `@`-scoped registry dirs). Keep only: remove agent symlinks + clear lock agents + set `enabled: false`.
- [ ] 3.2 Remove `UNIVERSAL_SKILLS_DIR` and `REGISTRY_EXTENSIONS_DIR` imports from `disable-skill.ts` (no longer needed)
- [ ] 3.3 Update handler tests in `packages/cli/src/cli-commands/skills/disable/handler.test.ts` to verify canonical directory is NOT removed on disable
- [ ] 3.4 Update E2E tests in `packages/cli/src/cli-commands/skills/disable/command.e2e.test.ts` to verify canonical directory survives disable
- [ ] 3.5 Run `pnpm typecheck` and fix any errors
- [ ] 3.6 Run `pnpm lint` and fix any errors
- [ ] 3.7 Run `pnpm test` and fix any failures
- [ ] 3.8 Run `pnpm test:e2e` and fix any failures
- [ ] 3.9 Kill any vitest worker processes

## 4. Enable Executor

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

> **Parallelization:** Phase 4, Phase 2, and Phase 3 are independent — can be launched as parallel subagents (all depend only on Phase 1).

- [ ] 4.1 Rewrite `enableSkill` in `packages/cli/src/cli-commands/skills/enable/enable-skill.ts`: remove all source-type branching (local/registry/git). Replace with: compute canonical path via `getSkillDir`, verify canonical directory exists, create agent symlinks from `skillSrcPath`, update state.
- [ ] 4.2 Remove unused imports from `enable-skill.ts` (`copySkillDirectory`, `removeIfExists`, `sanitizeName` if no longer needed, source-type related imports)
- [ ] 4.3 Update handler tests in `packages/cli/src/cli-commands/skills/enable/handler.test.ts` to verify enable works by symlink creation from existing canonical dir (no source resolution)
- [ ] 4.4 Update E2E tests in `packages/cli/src/cli-commands/skills/enable/command.e2e.test.ts` to verify enable re-creates symlinks from canonical directory without network access
- [ ] 4.5 Run `pnpm typecheck` and fix any errors
- [ ] 4.6 Run `pnpm lint` and fix any errors
- [ ] 4.7 Run `pnpm test` and fix any failures
- [ ] 4.8 Run `pnpm test:e2e` and fix any failures
- [ ] 4.9 Kill any vitest worker processes

## 5. Uninstall Executor

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

> **Parallelization:** Phase 5 is independent of Phases 2-4 — can be launched as parallel subagent (depends only on Phase 1).

- [ ] 5.1 Update `removeFromAllLocations` in `packages/cli/src/cli-commands/skills/uninstall/uninstall-skill.ts`: replace `.agents/skills/<name>` with `.axm/extensions/external/skills/<name>`. Keep `@`-scoped cleanup.
- [ ] 5.2 Update `existsInAnyLocation` in `uninstall-skill.ts`: check `.axm/extensions/external/skills/<name>` instead of `.agents/skills/<name>`. Keep `@`-scoped check.
- [ ] 5.3 Remove self-reference detection in uninstall agent symlink removal (agents whose `skills.dir` is `.agents/skills` now need symlink removal too)
- [ ] 5.4 Update handler tests for uninstall to reflect new canonical paths
- [ ] 5.5 Update E2E tests for uninstall to verify removal from new canonical location
- [ ] 5.6 Run `pnpm typecheck` and fix any errors
- [ ] 5.7 Run `pnpm lint` and fix any errors
- [ ] 5.8 Run `pnpm test` and fix any failures
- [ ] 5.9 Run `pnpm test:e2e` and fix any failures
- [ ] 5.10 Kill any vitest worker processes

## 6. Rename Executor and Remaining References

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

- [ ] 6.1 Update `renameSkill` in `packages/cli/src/cli-commands/skills/rename/rename-skill.ts`: self-reference detection for symlink removal/creation still uses `UNIVERSAL_SKILLS_DIR` (`.agents/skills`) — verify this is correct since `.agents/skills` remains the agent-visible symlink directory and rename needs to update symlinks there
- [ ] 6.2 Update rename handler tests to verify canonical rename operates on `.axm/extensions/external/skills/` paths for non-registry skills
- [ ] 6.3 Search for any remaining references to `.agents/skills` as a canonical (non-symlink) location and update
- [ ] 6.4 Run `pnpm typecheck` and fix any errors
- [ ] 6.5 Run `pnpm lint` and fix any errors
- [ ] 6.6 Run `pnpm test` and fix any failures
- [ ] 6.7 Run `pnpm test:e2e` and fix any failures
- [ ] 6.8 Kill any vitest worker processes

## 7. Full Integration Verification

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 2, 3, 4, 5, 6.

- [ ] 7.1 Run `pnpm typecheck` across all packages
- [ ] 7.2 Run `pnpm lint` across all packages
- [ ] 7.3 Run `pnpm test` across all packages
- [ ] 7.4 Run `pnpm test:e2e` across all packages
- [ ] 7.5 Kill any vitest worker processes
