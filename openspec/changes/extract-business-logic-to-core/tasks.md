> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Phase 1a: Move git/ to core

> **Subagent:** Run this entire phase in a single subagent.

No dependencies on other phases. Can run in parallel with Phase 1b and Phase 1c.

- [ ] 1.1 Create `packages/core/src/unstable/git/` directory with `index.ts` barrel
- [ ] 1.2 Move `packages/cli/src/git/operations.ts` to `packages/core/src/unstable/git/operations.ts`
- [ ] 1.3 Move `packages/cli/src/git/operations.test.ts` to `packages/core/src/unstable/git/operations.test.ts`, update imports
- [ ] 1.4 Add `./unstable/git` export entry to `packages/core/package.json`
- [ ] 1.5 Update all CLI imports of `../git/` or `../../git/` to `@axm.sh/core/unstable/git`
- [ ] 1.6 Remove `packages/cli/src/git/` directory
- [ ] 1.7 Run `pnpm typecheck` — fix any errors
- [ ] 1.8 Run `pnpm lint` — fix any errors
- [ ] 1.9 Run `pnpm test` — fix any failures
- [ ] 1.10 Run `pnpm test:e2e` — fix any failures
- [ ] 1.11 Kill any lingering vitest worker processes

## 2. Phase 1b: Move registry/ to core

> **Subagent:** Run this entire phase in a single subagent.

No dependencies on other phases. Can run in parallel with Phase 1a and Phase 1c.

- [ ] 2.1 Create `packages/core/src/unstable/registry/` directory with `index.ts` barrel
- [ ] 2.2 Move `packages/cli/src/registry/client.ts`, `client-remote.ts`, `local-client.ts`, `local-schema.ts`, `utils.ts` to `packages/core/src/unstable/registry/`
- [ ] 2.3 Move corresponding test files to `packages/core/src/unstable/registry/`, update imports
- [ ] 2.4 Add `./unstable/registry` export entry to `packages/core/package.json`
- [ ] 2.5 Update all CLI imports of `../registry/` or `../../registry/` to `@axm.sh/core/unstable/registry`
- [ ] 2.6 Remove `packages/cli/src/registry/` directory
- [ ] 2.7 Run `pnpm typecheck` — fix any errors
- [ ] 2.8 Run `pnpm lint` — fix any errors
- [ ] 2.9 Run `pnpm test` — fix any failures
- [ ] 2.10 Run `pnpm test:e2e` — fix any failures
- [ ] 2.11 Kill any lingering vitest worker processes

## 3. Phase 1c: Move auth/ business logic to core

> **Subagent:** Run this entire phase in a single subagent.

No dependencies on other phases. Can run in parallel with Phase 1a and Phase 1b.

- [ ] 3.1 Create `packages/core/src/unstable/auth/` directory with `index.ts` barrel
- [ ] 3.2 Move `packages/cli/src/auth/schema.ts`, `credential-store.ts`, `auth-client.ts`, `auth-middleware.ts`, `token-resolution.ts`, `device-login.ts`, `oauth-contract.ts` to `packages/core/src/unstable/auth/`
- [ ] 3.3 Move corresponding test files to `packages/core/src/unstable/auth/`, update imports
- [ ] 3.4 Add `./unstable/auth` export entry to `packages/core/package.json`
- [ ] 3.5 Update all CLI imports of the moved auth modules to `@axm.sh/core/unstable/auth`
- [ ] 3.6 Verify `login-interaction.ts` and `guard.ts` remain in `packages/cli/src/auth/` and import from `@axm.sh/core/unstable/auth`
- [ ] 3.7 Remove moved files from `packages/cli/src/auth/` (keep `login-interaction.ts`, `guard.ts`, and their `index.ts`)
- [ ] 3.8 Run `pnpm typecheck` — fix any errors
- [ ] 3.9 Run `pnpm lint` — fix any errors
- [ ] 3.10 Run `pnpm test` — fix any failures
- [ ] 3.11 Run `pnpm test:e2e` — fix any failures
- [ ] 3.12 Kill any lingering vitest worker processes

> **Parallelization:** Phases 1, 2, 3 are independent — launch as parallel subagents.

## 4. Phase 2a: Move workspace/ to core (with resolvePlan decomposition)

> **Subagent:** Run this entire phase in a single subagent.

**Depends on:** Phases 1a, 1b, 1c (all Phase 1 subagents must complete).

- [ ] 4.1 Create `packages/core/src/unstable/workspace/` directory with `index.ts` barrel
- [ ] 4.2 Move `packages/cli/src/workspace/plan.ts` to `packages/core/src/unstable/workspace/plan.ts` — pure data types, no changes needed
- [ ] 4.3 Move `packages/cli/src/workspace/apply-plan.ts` to `packages/core/src/unstable/workspace/apply-plan.ts`, update imports to use core paths
- [ ] 4.4 Move `packages/cli/src/workspace/apply-plan.test.ts` to core, update imports
- [ ] 4.5 Extract `scanPlanReadiness` as a new pure function in `packages/core/src/unstable/workspace/scan-plan-readiness.ts` — write tests first (red), then implement (green)
- [ ] 4.6 Refactor `augmentPlanWithReconciliation` in `packages/cli/src/workspace/service.ts`: remove `renderer` parameter, return `AugmentedPlanResult { plan: Plan; reconciliationTriggered: boolean; reason?: "missing" | "invalid" }` — write tests first for the new return type
- [ ] 4.7 Move the refactored `augmentPlanWithReconciliation` to `packages/core/src/unstable/workspace/augment-plan.ts`
- [ ] 4.8 Move `packages/cli/src/workspace/reconciliation.ts`, `reconciliation-types.ts`, `taxonomy-types.ts`, `classifier.ts`, `classifier-records.ts`, `source-metadata.ts`, `builtin-packs.ts`, `initialization.ts`, `paths.ts`, `scope.ts`, `plan-bridge.ts` to `packages/core/src/unstable/workspace/`
- [ ] 4.9 Move corresponding test files, update imports
- [ ] 4.10 Move `packages/cli/src/workspace/service.ts` to `packages/core/src/unstable/workspace/service.ts` — remove `resolvePlan` from `WorkspaceContextService` interface, remove `resolvePlan` method implementation, remove `displayPlan` import
- [ ] 4.11 Create `packages/cli/src/workspace/resolve-plan.ts` — the CLI free function implementing `resolvePlan` using core's `augmentPlan`, `scanPlanReadiness`, `applyPlan`, and CLI's `displayPlan` (write tests first)
- [ ] 4.12 Update `packages/cli/src/workspace/display-plan.ts` to import plan types from `@axm.sh/core/unstable/workspace`
- [ ] 4.13 Update all ~15 CLI call sites: change `ws.resolvePlan(plan, flags)` to `resolvePlan(plan, flags)` (import from `../workspace/resolve-plan.js`)
- [ ] 4.14 Add `./unstable/workspace` export entry to `packages/core/package.json`
- [ ] 4.15 Update all CLI imports of workspace modules to `@axm.sh/core/unstable/workspace`
- [ ] 4.16 Clean up `packages/cli/src/workspace/` — remove moved files, keep `resolve-plan.ts`, `display-plan.ts`, `resolve-plan-architecture.test.ts`, and barrel `index.ts`
- [ ] 4.17 Run `pnpm typecheck` — fix any errors
- [ ] 4.18 Run `pnpm lint` — fix any errors
- [ ] 4.19 Run `pnpm test` — fix any failures
- [ ] 4.20 Run `pnpm test:e2e` — fix any failures
- [ ] 4.21 Kill any lingering vitest worker processes

## 5. Phase 2b: Move sources/ and discoverSkillsInDir to core

> **Subagent:** Run this entire phase in a single subagent.

**Depends on:** Phase 4 (workspace must be in core first, since sources depends on Workspace).

- [ ] 5.1 Create `packages/core/src/unstable/source-resolution/` directory with `index.ts` barrel
- [ ] 5.2 Move `packages/cli/src/root/skills/install/discover-skills.ts` to `packages/core/src/unstable/source-resolution/discover-skills.ts` (or `unstable/skill-discovery/`)
- [ ] 5.3 Move `packages/cli/src/root/skills/install/discover-skills.test.ts` alongside it, update imports
- [ ] 5.4 Move `packages/cli/src/sources/service.ts`, `resolve-source.ts`, `resolve-source-pattern.ts` to `packages/core/src/unstable/source-resolution/`
- [ ] 5.5 Move `packages/cli/src/sources/providers/` (all provider files: `git.ts`, `git-hosting.ts`, `local.ts`, `builtin.ts`, `index.ts`, `registry/`) to `packages/core/src/unstable/source-resolution/providers/`
- [ ] 5.6 Move corresponding test files, update imports
- [ ] 5.7 Update all provider imports of `discoverSkillsInDir` to use the new core location
- [ ] 5.8 Update all provider imports of git, registry, workspace to use `@axm.sh/core/unstable/*` paths
- [ ] 5.9 Add `./unstable/source-resolution` export entry to `packages/core/package.json`
- [ ] 5.10 Update all CLI imports of source modules to `@axm.sh/core/unstable/source-resolution`
- [ ] 5.11 Remove `packages/cli/src/sources/` directory
- [ ] 5.12 Remove `packages/cli/src/root/skills/install/discover-skills.ts` and its test (verify no other CLI code imports it directly)
- [ ] 5.13 Run `pnpm typecheck` — fix any errors
- [ ] 5.14 Run `pnpm lint` — fix any errors
- [ ] 5.15 Run `pnpm test` — fix any failures
- [ ] 5.16 Run `pnpm test:e2e` — fix any failures
- [ ] 5.17 Kill any lingering vitest worker processes

## 6. Phase 3a: Extract CodingAgentRepository interface to core

> **Subagent:** Run this entire phase in a single subagent.

**Depends on:** Phase 4 (workspace in core — agents module in core already exists).

- [ ] 6.1 Define `CodingAgentRepository` service interface in `packages/core/src/unstable/agents/` — write the interface type with methods needed by extension managers (agent listing, skills directory paths)
- [ ] 6.2 Export the interface from `@axm.sh/core/unstable/agents` barrel
- [ ] 6.3 Update `packages/cli/src/agents/coding-agent.ts` and `repository.ts` to implement the core interface
- [ ] 6.4 Run `pnpm typecheck` — fix any errors
- [ ] 6.5 Run `pnpm lint` — fix any errors
- [ ] 6.6 Run `pnpm test` — fix any failures
- [ ] 6.7 Kill any lingering vitest worker processes

## 7. Phase 3b: Move extensions/ to core

> **Subagent:** Run this entire phase in a single subagent.

**Depends on:** Phases 4, 5, 6 (workspace, sources, and CodingAgentRepository interface must be in core).

> **Parallelization:** Tasks 7.2, 7.3, 7.4, 7.5 are independent — launch as parallel subagents if desired.

- [ ] 7.1 Create `packages/core/src/unstable/extension-managers/` directory with `index.ts` barrel
- [ ] 7.2 Move `packages/cli/src/extensions/skills/` (manager.ts, operations/, paths.ts, reconciliation-adapter.ts, utils.ts, layers.ts) to `packages/core/src/unstable/extension-managers/skills/`, update imports to use core paths for workspace, registry, sources, agents
- [ ] 7.3 Move `packages/cli/src/extensions/packs/` (manager.ts, operations/, paths.ts, reconciliation-adapter.ts, expansion.ts, layers.ts) to `packages/core/src/unstable/extension-managers/packs/`
- [ ] 7.4 Move `packages/cli/src/extensions/commands/` (manager.ts, operations/, layers.ts, reconciliation-adapter.ts) to `packages/core/src/unstable/extension-managers/commands/`
- [ ] 7.5 Move `packages/cli/src/extensions/mcp-servers/` (manager.ts, operations/, layers.ts, reconciliation-adapter.ts) to `packages/core/src/unstable/extension-managers/mcp-servers/`
- [ ] 7.6 Move `packages/cli/src/extensions/index.ts` (registry ref builders) to core
- [ ] 7.7 Move all corresponding test files, update imports
- [ ] 7.8 Update extension manager imports of `CodingAgentRepository` to use the core interface (not the concrete `DefaultCodingAgentRepository`)
- [ ] 7.9 Add `./unstable/extension-managers` export entry to `packages/core/package.json`
- [ ] 7.10 Update all CLI imports of extension modules to `@axm.sh/core/unstable/extension-managers`
- [ ] 7.11 Remove `packages/cli/src/extensions/` directory
- [ ] 7.12 Run `pnpm typecheck` — fix any errors
- [ ] 7.13 Run `pnpm lint` — fix any errors
- [ ] 7.14 Run `pnpm test` — fix any failures
- [ ] 7.15 Run `pnpm test:e2e` — fix any failures
- [ ] 7.16 Kill any lingering vitest worker processes

## 8. Phase 3c: Move operation workflows to core

> **Subagent:** Run this entire phase in a single subagent.

**Depends on:** Phase 7 (extension managers must be in core, since operation workflows use ExtensionManager types).

- [ ] 8.1 Create `packages/core/src/unstable/extension-operations/` directory with `index.ts` barrel
- [ ] 8.2 Move `packages/cli/src/workflows/install-operation/workflow.ts` to `packages/core/src/unstable/extension-operations/install-operation.ts`, update imports
- [ ] 8.3 Move `packages/cli/src/workflows/uninstall-operation/workflow.ts` to `packages/core/src/unstable/extension-operations/uninstall-operation.ts`, update imports
- [ ] 8.4 Move corresponding test files, update imports
- [ ] 8.5 Add `./unstable/extension-operations` export entry to `packages/core/package.json`
- [ ] 8.6 Update CLI imports of operation workflow types (`ExtensionManager`, `ExtensionTarget`, `buildInstallOperation`, `buildUninstallOperation`) to `@axm.sh/core/unstable/extension-operations`
- [ ] 8.7 Remove `packages/cli/src/workflows/install-operation/` and `uninstall-operation/` directories
- [ ] 8.8 Run `pnpm typecheck` — fix any errors
- [ ] 8.9 Run `pnpm lint` — fix any errors
- [ ] 8.10 Run `pnpm test` — fix any failures
- [ ] 8.11 Run `pnpm test:e2e` — fix any failures
- [ ] 8.12 Kill any lingering vitest worker processes

## 9. Final verification

> **Subagent:** Run this entire phase in a single subagent.

**Depends on:** All previous phases.

- [ ] 9.1 Verify `packages/core/package.json` has all new export entries: `unstable/git`, `unstable/registry`, `unstable/auth`, `unstable/workspace`, `unstable/source-resolution`, `unstable/extension-managers`, `unstable/extension-operations`
- [ ] 9.2 Verify no CLI source files import from moved directories via relative paths (grep for old import patterns)
- [ ] 9.3 Verify no core source files import from `@axm.sh/cli` or use relative paths outside `packages/core/`
- [ ] 9.4 Verify CLI retains only: `root/`, `workflows/install-command/`, `workflows/uninstall-command/`, `workspace/resolve-plan.ts`, `workspace/display-plan.ts`, `auth/login-interaction.ts`, `auth/guard.ts`, `builtin-pack/`, `dev-cli-commands/`, `cli-flags/`, `agents/` (implementations), `runtime/`, entry points
- [ ] 9.5 Run full `pnpm build` — verify both packages build cleanly
- [ ] 9.6 Run full `pnpm typecheck` — zero errors
- [ ] 9.7 Run full `pnpm lint` — zero errors
- [ ] 9.8 Run full `pnpm test` — all tests pass
- [ ] 9.9 Run full `pnpm test:e2e` — all E2E tests pass
- [ ] 9.10 Kill any lingering vitest worker processes
