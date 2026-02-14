> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Update build-plan to accept mixed operations

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 Write tests for `buildInstallPlan` with mixed `InstallPackOperation | InstallSkillOperation` operations: pack steps check `lockfile.packs`, skill steps check `lockfile.skills`, already-installed skills marked no-op, pack step before skill steps
- [ ] 1.2 Define `PackInstallOp = InstallPackOperation | InstallSkillOperation` union type in `build-plan.ts`
- [ ] 1.3 Update `buildInstallPlan` signature to accept `ReadonlyArray<PackInstallOp>` and dispatch on `op.name` for no-op detection
- [ ] 1.4 Run `pnpm typecheck` and fix any errors
- [ ] 1.5 Run `pnpm lint` and fix any errors
- [ ] 1.6 Run `pnpm test` and fix any failures
- [ ] 1.7 Kill any vitest worker processes

## 2. Fetch skill dependencies in pack install handler

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

- [ ] 2.1 Write handler tests: pack with skill dependencies produces combined plan with pack + skill ops; already-installed skills marked no-op; dependency fetch failure produces CliError
- [ ] 2.2 After reading the pack manifest (line 239), resolve each FQN in `manifest.skills` via `resolveSource`, then discover via `sources.resolveExtension` and fetch via `sources.fetch` concurrently with `Effect.forEach`
- [ ] 2.3 Build `InstallSkillOperation` for each fetched skill using `ws.getConfiguredAgents()` for agent IDs, the fetched archive location, and resolved version
- [ ] 2.4 Build combined plan with pack op first, then skill ops, and provide both `installPack` and `installSkill` handlers to `ws.resolvePlan`
- [ ] 2.5 Run `pnpm typecheck` and fix any errors
- [ ] 2.6 Run `pnpm lint` and fix any errors
- [ ] 2.7 Run `pnpm test` and fix any failures
- [ ] 2.8 Run `pnpm test:e2e` and fix any failures
- [ ] 2.9 Kill any vitest worker processes
