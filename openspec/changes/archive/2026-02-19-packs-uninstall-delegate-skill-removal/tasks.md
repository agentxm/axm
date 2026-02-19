> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Update plan builder to emit union plan with skill steps

> **Subagent:** Run this entire phase in a single subagent.

- [x] 1.1 Write tests for updated `buildUninstallPlan` in `packages/cli/src/cli-commands/packs/uninstall/plan.test.ts`: add `PackUninstallOp` union type, accept lockfile + configured skills, emit `uninstall-skill` steps for removable skills, verify pack-first ordering, verify shared skills excluded, verify directly-installed skills excluded, verify glob batch removal computes remaining packs correctly
- [x] 1.2 Define `PackUninstallOp = UninstallPackOperation | UninstallSkillOperation` union type in `packages/cli/src/cli-commands/packs/uninstall/plan.ts` (mirrors `PackInstallOp` pattern from `packs/install/plan.ts`)
- [x] 1.3 Update `buildUninstallPlan` signature to accept lockfile, configured skills map, and pack operations; compute removable skills inline (collect from target packs' `resolvedSkills`, exclude skills in remaining packs, exclude skills with direct settings entries); emit `uninstall-skill` steps with `agents: []` after pack steps; return `Plan<PackUninstallOp>`
- [x] 1.4 Remove re-exports of `findOrphanedSkills`, `findOrphanedCommands`, `findOrphanedMcpServers` from `plan.ts`
- [x] 1.5 Run `pnpm typecheck` — fix any errors
- [x] 1.6 Run `pnpm lint` — fix any errors
- [x] 1.7 Run `pnpm test` — fix any failures
- [x] 1.8 Run `pnpm test:e2e` — fix any failures
- [x] 1.9 Kill any vitest worker processes

## 2. Simplify uninstall-pack operation handler

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

- [x] 2.1 Update tests in `packages/cli/src/extensions/packs/operations/uninstall.test.ts`: remove orphan detection test cases, verify handler only removes pack directory + settings + lockfile, keep orphaned-folder-on-disk tests unchanged
- [x] 2.2 Strip orphan detection and skill removal logic from `packages/cli/src/extensions/packs/operations/uninstall.ts`: remove `findOrphanedSkills` import, remove `parseFqn` import (if no longer used), remove orphan detection block (lines ~128-201), keep pack-directory removal and pack settings/lockfile removal
- [x] 2.3 Run `pnpm typecheck` — fix any errors
- [x] 2.4 Run `pnpm lint` — fix any errors
- [x] 2.5 Run `pnpm test` — fix any failures
- [x] 2.6 Run `pnpm test:e2e` — fix any failures
- [x] 2.7 Kill any vitest worker processes

## 3. Wire handler to use both operation handlers

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 1 and 2.

- [x] 3.1 Update tests in `packages/cli/src/cli-commands/packs/uninstall/handler.test.ts`: verify handler passes configured skills to plan builder, verify `resolvePlan` receives both `uninstall-pack` and `uninstall-skill` handlers
- [x] 3.2 Update `packages/cli/src/cli-commands/packs/uninstall/handler.ts`: import `uninstallSkill` from skills operations, load configured skills via `ws.getConfiguredSkills()`, pass configured skills to `buildUninstallPlan`, wire `resolvePlan` with `{ "uninstall-pack": uninstallPack, "uninstall-skill": uninstallSkill }`
- [x] 3.3 Run `pnpm typecheck` — fix any errors
- [x] 3.4 Run `pnpm lint` — fix any errors
- [x] 3.5 Run `pnpm test` — fix any failures
- [x] 3.6 Run `pnpm test:e2e` — fix any failures
- [x] 3.7 Kill any vitest worker processes

## 4. Remove orphan-detection module

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 3.

- [x] 4.1 Delete `packages/cli/src/extensions/packs/operations/orphan-detection.ts`
- [x] 4.2 Delete `packages/cli/src/extensions/packs/operations/orphan-detection.test.ts`
- [x] 4.3 Remove any remaining imports of orphan-detection functions across the codebase
- [x] 4.4 Run `pnpm typecheck` — fix any errors
- [x] 4.5 Run `pnpm lint` — fix any errors
- [x] 4.6 Run `pnpm test` — fix any failures
- [x] 4.7 Run `pnpm test:e2e` — fix any failures
- [x] 4.8 Kill any vitest worker processes

## 5. Update specs

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 4.

- [x] 5.1 Sync delta spec `cli-packs-uninstall` to `openspec/specs/cli-packs-uninstall/spec.md` via `openspec sync --change packs-uninstall-delegate-skill-removal`
