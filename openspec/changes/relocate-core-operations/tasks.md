> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Constants, Types, and Paths

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 1.1, 1.2, 1.3 are independent — launch as parallel subagents.

Co-locate constants into their relevant modules and move path utilities.

- [ ] 1.1 Move `MANIFEST_FILENAME` from `cli-commands/skills/constants.ts` → `extensions/skills/manifest-schema.ts`. Move `UNIVERSAL_SKILLS_DIR` to `extensions/skills/paths.ts` if used, otherwise remove. Update all imports.
- [ ] 1.2 Move `PACK_MANIFEST_FILENAME` and `RawPackManifest` from `cli-commands/packs/constants.ts` → `extensions/packs/manifest-schema.ts`. Update all imports.
- [ ] 1.3 Move `computePackPaths` and `PackDirPath` from `cli-commands/packs/pack-paths.ts` → `extensions/packs/paths.ts`. Move `cli-commands/packs/pack-paths.test.ts` → `extensions/packs/paths.test.ts`. Update all imports.
- [ ] 1.4 Delete `cli-commands/skills/constants.ts` and `cli-commands/packs/constants.ts` (contents distributed).
- [ ] 1.5 Delete duplicate `Skill` interface from `cli-commands/skills/operations.ts` (already in `extensions/skills/types.ts`).
- [ ] 1.6 Run `pnpm typecheck` — fix any errors.
- [ ] 1.7 Run `pnpm lint` — fix any errors.
- [ ] 1.8 Run `pnpm test` — fix any failures.
- [ ] 1.9 Run `pnpm test:e2e` — fix any failures.
- [ ] 1.10 Kill any lingering vitest worker processes.

## 2. Shared Helpers

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 2.1, 2.2, 2.3, 2.4 are independent — launch as parallel subagents.

Move shared helpers to appropriate general-purpose modules.

- [ ] 2.1 Move `cli-commands/skills/fs-helpers.ts` → `utils/fs-helpers.ts`. Update all imports.
- [ ] 2.2 Move `cli-commands/skills/source-to-lock-entry.ts` → `sources/source-to-lock-entry.ts`. Move `cli-commands/skills/source-to-lock-entry.test.ts` → `sources/source-to-lock-entry.test.ts`. Update all imports.
- [ ] 2.3 Move `cli-commands/skills/skill-paths.ts` → `extensions/skills/paths.ts`. Move `cli-commands/skills/skill-paths.test.ts` → `extensions/skills/paths.test.ts`. Update all imports.
- [ ] 2.4 Move `cli-commands/skills/install/skill-utils.ts` → `extensions/skills/utils.ts`. Move `cli-commands/skills/install/skill-utils.test.ts` → `extensions/skills/utils.test.ts`. Update all imports.
- [ ] 2.5 Run `pnpm typecheck` — fix any errors.
- [ ] 2.6 Run `pnpm lint` — fix any errors.
- [ ] 2.7 Run `pnpm test` — fix any failures.
- [ ] 2.8 Run `pnpm test:e2e` — fix any failures.
- [ ] 2.9 Kill any lingering vitest worker processes.

## 3. Skill Operations

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 3.1 through 3.9 are independent — launch as parallel subagents.

Merge each skill operation's type definition (from `operations.ts`) and executor into a single file under `extensions/skills/operations/`. Move operation-level helpers alongside.

- [ ] 3.1 Create `extensions/skills/operations/` directory. Move `cli-commands/skills/install/install-skill.ts` → `extensions/skills/operations/install.ts`. Merge `InstallSkillOperation` and `InstallSkillOperationArgs` types from `operations.ts` into this file. Move test file alongside.
- [ ] 3.2 Move `cli-commands/skills/uninstall/uninstall-skill.ts` → `extensions/skills/operations/uninstall.ts`. Merge `UninstallSkillOperation` and `UninstallSkillOperationArgs` types. Move test file alongside.
- [ ] 3.3 Move `cli-commands/skills/publish-skill.ts` → `extensions/skills/operations/publish.ts`. Merge `PublishSkillOperation` and `PublishSkillOperationArgs` types. Move test file alongside.
- [ ] 3.4 Move `cli-commands/skills/copy-skill.ts` → `extensions/skills/operations/copy.ts`. Merge `CopySkillOperation` and `CopySkillOperationArgs` types. Move test file alongside.
- [ ] 3.5 Move `cli-commands/skills/enable/enable-skill.ts` → `extensions/skills/operations/enable.ts`. Merge `EnableSkillOperation` type. Move test file alongside.
- [ ] 3.6 Move `cli-commands/skills/disable/disable-skill.ts` → `extensions/skills/operations/disable.ts`. Merge `DisableSkillOperation` type. Move test file alongside.
- [ ] 3.7 Move `cli-commands/skills/rename/rename-skill.ts` → `extensions/skills/operations/rename.ts`. Merge `RenameSkillOperation` type. Move test file alongside.
- [ ] 3.8 Move `cli-commands/skills/copy-skill-directory.ts` → `extensions/skills/operations/copy-directory.ts`. Move test file alongside.
- [ ] 3.9 Move `cli-commands/skills/install/install-result.ts` → `extensions/skills/operations/install-result.ts`.
- [ ] 3.10 Update barrel exports: add `extensions/skills/operations/index.ts` re-exporting all operations. Update `extensions/skills/index.ts` and `extensions/index.ts`.
- [ ] 3.11 Update all imports across the codebase to use new paths.
- [ ] 3.12 Run `pnpm typecheck` — fix any errors.
- [ ] 3.13 Run `pnpm lint` — fix any errors.
- [ ] 3.14 Run `pnpm test` — fix any failures.
- [ ] 3.15 Run `pnpm test:e2e` — fix any failures.
- [ ] 3.16 Kill any lingering vitest worker processes.

## 4. Pack Operations

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 4.1 through 4.5 are independent — launch as parallel subagents.

Merge each pack operation's type definition and executor into `extensions/packs/operations/`.

- [ ] 4.1 Create `extensions/packs/operations/` directory. Move `cli-commands/packs/install/install-pack.ts` → `extensions/packs/operations/install.ts`. Merge `InstallPackOperation` and `InstallPackOperationArgs` types from `operations.ts`. Move test file alongside.
- [ ] 4.2 Move `cli-commands/packs/uninstall/uninstall-pack.ts` → `extensions/packs/operations/uninstall.ts`. Merge `UninstallPackOperation` and `UninstallPackOperationArgs` types.
- [ ] 4.3 Move `cli-commands/packs/publish/publish-pack.ts` → `extensions/packs/operations/publish.ts`. Merge `PublishPackOperation` and `PublishPackOperationArgs` types.
- [ ] 4.4 Move `cli-commands/packs/publish-extension.ts` → `extensions/packs/operations/publish-extension.ts`. Merge `PublishExtensionOperation` and `PublishExtensionOperationArgs` types. Move test file alongside.
- [ ] 4.5 Extract `UnpackPackOperation` and `unpackPack` from `cli-commands/packs/unpack/handler.ts` → `extensions/packs/operations/unpack.ts`.
- [ ] 4.6 Update barrel exports: add `extensions/packs/operations/index.ts` re-exporting all operations. Update `extensions/packs/index.ts` and `extensions/index.ts`.
- [ ] 4.7 Update all imports across the codebase to use new paths.
- [ ] 4.8 Run `pnpm typecheck` — fix any errors.
- [ ] 4.9 Run `pnpm lint` — fix any errors.
- [ ] 4.10 Run `pnpm test` — fix any failures.
- [ ] 4.11 Run `pnpm test:e2e` — fix any failures.
- [ ] 4.12 Kill any lingering vitest worker processes.

## 5. Rename Plan Builders

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 5.1 through 5.5 are independent — launch as parallel subagents.

Rename `build-plan.ts` → `plan.ts` in each command directory. Update imports to point at new module locations.

- [ ] 5.1 Rename `cli-commands/skills/install/build-plan.ts` → `plan.ts` and `build-plan.test.ts` → `plan.test.ts`. Update all imports.
- [ ] 5.2 Rename `cli-commands/skills/uninstall/build-plan.ts` → `plan.ts` and `build-plan.test.ts` → `plan.test.ts`. Update all imports.
- [ ] 5.3 Rename `cli-commands/skills/update/build-plan.ts` → `plan.ts` and `build-plan.test.ts` → `plan.test.ts`. Update all imports.
- [ ] 5.4 Rename `cli-commands/packs/install/build-plan.ts` → `plan.ts` and `build-plan.test.ts` → `plan.test.ts`. Update all imports.
- [ ] 5.5 Rename `cli-commands/packs/uninstall/build-plan.ts` → `plan.ts` and `build-plan.test.ts` → `plan.test.ts`. Update all imports.
- [ ] 5.6 Run `pnpm typecheck` — fix any errors.
- [ ] 5.7 Run `pnpm lint` — fix any errors.
- [ ] 5.8 Run `pnpm test` — fix any failures.
- [ ] 5.9 Run `pnpm test:e2e` — fix any failures.
- [ ] 5.10 Kill any lingering vitest worker processes.

## 6. Cleanup

> **Subagent:** Run this entire phase in a single subagent.

Remove empty files, obsolete barrels, and empty directories.

- [ ] 6.1 Delete `cli-commands/skills/operations.ts` (all types distributed to individual operation files).
- [ ] 6.2 Delete `cli-commands/packs/operations.ts` (all types distributed to individual operation files).
- [ ] 6.3 Update `cli-commands/skills/index.ts` — remove re-exports of relocated items (`copySkillDirectory`, `sourceToLockEntry`, `computeSkillPaths`). Remove barrel entirely if empty.
- [ ] 6.4 Update `cli-commands/packs/index.ts` — remove re-exports of relocated items (`computePackPaths`, `PackDirPath`, operation types). Keep command re-exports.
- [ ] 6.5 Remove any empty directories left behind after moves.
- [ ] 6.6 Run `pnpm typecheck` — fix any errors.
- [ ] 6.7 Run `pnpm lint` — fix any errors.
- [ ] 6.8 Run `pnpm test` — fix any failures.
- [ ] 6.9 Run `pnpm test:e2e` — fix any failures.
- [ ] 6.10 Kill any lingering vitest worker processes.
- [ ] 6.11 Run `pnpm format` — ensure formatting is clean.
