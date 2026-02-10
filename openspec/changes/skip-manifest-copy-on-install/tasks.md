> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Fork executor — write content to `src/`

> **Subagent:** Run this entire phase in a single subagent.

Depends on: none

- [ ] 1.1 Update `fork-skill.ts` tests: expect content in `<targetDir>/src/` and manifest at `<targetDir>/axm-skill.json`
- [ ] 1.2 Update `forkSkill` in `fork-skill.ts`: change `copySkillDirectory(sourcePath, targetDir)` to `copySkillDirectory(sourcePath, path.join(targetDir, "src"))`; manifest write path stays at `path.join(targetDir, MANIFEST_FILENAME)` (already correct)
- [ ] 1.3 Run `pnpm typecheck` and fix any errors
- [ ] 1.4 Run `pnpm lint` and fix any errors
- [ ] 1.5 Run `pnpm test` and fix any failures
- [ ] 1.6 Run `pnpm test:e2e` and fix any failures
- [ ] 1.7 Kill any vitest worker processes

## 2. Publish executor — archive `src/` only

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

- [ ] 2.1 Update `publish-skill.ts` tests: expect archive built from `<extensionDir>/src/` (not `<extensionDir>/`)
- [ ] 2.2 Update `publishSkill` in `publish-skill.ts`: change `buildZipArchive(extensionDir)` to `buildZipArchive(path.join(extensionDir, "src"))`
- [ ] 2.3 Run `pnpm typecheck` and fix any errors
- [ ] 2.4 Run `pnpm lint` and fix any errors
- [ ] 2.5 Run `pnpm test` and fix any failures
- [ ] 2.6 Run `pnpm test:e2e` and fix any failures
- [ ] 2.7 Kill any vitest worker processes

## 3. Install executor — symlink `src/` for registry sources

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

- [ ] 3.1 Update `install-skill.ts` tests: for registry sources, expect symlinks/copies targeting `<canonicalPath>/src/`; for non-registry sources, expect unchanged behavior
- [ ] 3.2 Update `installSkill` in `install-skill.ts`: derive `contentPath` as `path.join(canonicalPath, "src")` for registry sources, `canonicalPath` for others; pass `contentPath` to `copySkillDirectory` destination and to `installForAgent` as the symlink target; update `isSelfCopy` to compare against `contentPath`
- [ ] 3.3 Run `pnpm typecheck` and fix any errors
- [ ] 3.4 Run `pnpm lint` and fix any errors
- [ ] 3.5 Run `pnpm test` and fix any failures
- [ ] 3.6 Run `pnpm test:e2e` and fix any failures
- [ ] 3.7 Kill any vitest worker processes

## 4. E2E validation

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 1, 2, 3

- [ ] 4.1 Update fork E2E tests (`fork.e2e.test.ts`): verify content files land in `src/` and manifest at extension root
- [ ] 4.2 Update publish E2E tests (`publish.e2e.test.ts`): verify archive contains only content files (no `axm-skill.json`)
- [ ] 4.3 Update registry install E2E tests (`registry-install.e2e.test.ts`): verify agent symlinks point to `src/` and agents don't see `axm-skill.json`
- [ ] 4.4 Run `pnpm typecheck` and fix any errors
- [ ] 4.5 Run `pnpm lint` and fix any errors
- [ ] 4.6 Run `pnpm test` and fix any failures
- [ ] 4.7 Run `pnpm test:e2e` and fix any failures
- [ ] 4.8 Kill any vitest worker processes
