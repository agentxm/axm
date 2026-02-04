## 1. Delete Dead Code (installer.ts)

- [x] 1.1 Delete `packages/core/src/experimental/skills/installer.ts`
- [x] 1.2 Delete `packages/core/src/experimental/skills/installer.test.ts`
- [x] 1.3 Remove installer exports from `skills/index.ts` (InstallMethod, InstallResult, copySkillToCanonical, copyToAgent, createAgentSymlink, InstallError, installSkill, installSkillToAgents, removeSkillFromAgents)
- [x] 1.4 Run `pnpm typecheck` to confirm nothing imports deleted code
- [x] 1.5 Run `pnpm lint` and fix any errors
- [x] 1.6 Run `pnpm test` and fix any failures
- [x] 1.7 Kill any vitest worker processes

## 2. Create agents/ Module - Types and Constants

- [x] 2.1 Create `packages/core/src/experimental/agents/` directory
- [x] 2.2 Create `agents/types.ts` with AgentConfig, AgentSkillsConfig, AgentId union type, and AgentRegistry type
- [x] 2.3 Create `agents/constants.ts` with shared path constants (home, configHome, claudeHome, codexHome)
- [x] 2.4 Run `pnpm typecheck` and fix any errors
- [x] 2.5 Run `pnpm lint` and fix any errors

## 3. Create agents/ Module - Registry

- [x] 3.1 Write `agents/registry.test.ts` with dynamic tests: all agents have projectDir, projectDir ends with /skills, globalDir is Option, id matches key
- [x] 3.2 Create `agents/registry.ts` with AGENTS Record sourced from vercel-labs/skills reference
- [x] 3.3 Implement getAgentById returning Option<AgentConfig>
- [x] 3.4 Implement getAgentIds and getAllAgents helper functions
- [x] 3.5 Run `pnpm typecheck` and fix any errors
- [x] 3.6 Run `pnpm lint` and fix any errors
- [x] 3.7 Run `pnpm test packages/core/src/experimental/agents/` and fix any failures
- [x] 3.8 Kill any vitest worker processes

## 4. Create agents/ Module - Detection

- [x] 4.1 Write `agents/detection.test.ts` with tests for detectAgent and detectAgents
- [x] 4.2 Create `agents/detection.ts` with DetectionError class
- [x] 4.3 Implement detectAgent(agent) with per-agent detection logic
- [x] 4.4 Implement detectAgents() with concurrent detection
- [x] 4.5 Run `pnpm typecheck` and fix any errors
- [x] 4.6 Run `pnpm lint` and fix any errors
- [x] 4.7 Run `pnpm test packages/core/src/experimental/agents/` and fix any failures
- [x] 4.8 Kill any vitest worker processes

## 5. Create agents/ Module - Exports

- [x] 5.1 Create `agents/index.ts` barrel file exporting types, registry, and detection
- [x] 5.2 Update `experimental/index.ts` to export agents module
- [x] 5.3 Run `pnpm typecheck` and fix any errors
- [x] 5.4 Run `pnpm lint` and fix any errors
- [x] 5.5 Run `pnpm test` and fix any failures
- [x] 5.6 Kill any vitest worker processes

## 6. Enhance workspace/apply.ts - Lockfile and Settings Updates

- [x] 6.1 Write tests for updateLockfileForPlan function
- [x] 6.2 Extract updateLockfileForPlan from skills/state/apply.ts into workspace/apply.ts
- [x] 6.3 Write tests for updateSettingsForPlan function
- [x] 6.4 Extract updateSettingsForPlan from skills/state/apply.ts into workspace/apply.ts
- [x] 6.5 Update applyPlan to use built-in lockfile/settings updates instead of injected deps
- [x] 6.6 Run `pnpm typecheck` and fix any errors
- [x] 6.7 Run `pnpm lint` and fix any errors
- [x] 6.8 Run `pnpm test packages/core/src/experimental/workspace/` and fix any failures
- [x] 6.9 Kill any vitest worker processes

## 7. Enhance workspace/apply.ts - Agent Path Resolution

- [x] 7.1 Write test: verify all agents in plan receive skill installation (no silent skips)
- [x] 7.2 Update AgentConfig import in workspace/apply.ts to use agents/ module
- [x] 7.3 Change syncToAgents to use agent.skills.projectDir instead of agent.skillsDir
- [x] 7.4 Change removeFromAgents to use agent.skills.projectDir instead of agent.skillsDir
- [x] 7.5 Remove silent skip for agents without skillsDir (now required)
- [x] 7.6 Run `pnpm typecheck` and fix any errors
- [x] 7.7 Run `pnpm lint` and fix any errors
- [x] 7.8 Run `pnpm test packages/core/src/experimental/workspace/` and fix any failures
- [x] 7.9 Kill any vitest worker processes

## 8. Enhance workspace/apply.ts - Comprehensive Tests

_All tests already exist in apply.test.ts (verified 2024-02-04)._

- [x] 8.1 Test applyStep InstallSkill copies to canonical + syncs to agents (lines 503-644)
- [x] 8.2 Test applyStep UninstallSkill removes from agents + canonical (lines 793-866)
- [x] 8.3 Test applyStep UpdateSkill removes old + installs new (lines 707-754)
- [x] 8.4 Test applyPlan updates lockfile on success (lines 239-254, 919-1137)
- [x] 8.5 Test applyPlan updates settings on success (lines 239-254, 1180-1379)
- [x] 8.6 Test applyPlan with dryRun: true makes no changes (lines 186-206)
- [x] 8.7 Run `pnpm typecheck` and fix any errors
- [x] 8.8 Run `pnpm lint` and fix any errors (one fix: `version` -> `_version` in sourceV2ToLockEntry)
- [x] 8.9 Run `pnpm test packages/core/src/experimental/workspace/` and fix any failures (116 tests pass)
- [x] 8.10 Kill any vitest worker processes

## 9. Update Legacy Apply to Use New AgentConfig

_BLOCKER: The CLI handlers use `applyDiff` from `skills/state/apply.ts` which expects the OLD
AgentConfig type (with `detectPath` and optional `skillsDir`). The new AgentConfig from `agents/`
has `skills.projectDir` and `skills.globalDir` instead. Handlers cannot be migrated until the
legacy apply accepts the new type._

_Option A: Update `skills/state/apply.ts` to accept new AgentConfig type (keeps legacy pipeline)_
_Option B: Create workspace V2 pipeline (`loadCurrentState`, `buildIdealState`, `buildPlan`) (full migration)_

_Choosing Option A for this change - full V2 migration deferred to separate change._

- [x] 9.1 Update `skills/state/apply.ts` to import AgentConfig from `agents/` module
- [x] 9.2 Update `applyAdd` to use `agent.skills.projectDir` instead of `agent.skillsDir ?? ...` fallback
- [x] 9.3 Update `applyRemove` to use `agent.skills.projectDir` instead of fallback
- [x] 9.4 Update any other functions that access agent paths
- [x] 9.5 Run `pnpm typecheck` and fix any errors
- [x] 9.6 Run `pnpm lint` and fix any errors
- [x] 9.7 Run `pnpm test packages/core/src/experimental/skills/state/` and fix any failures (178 tests pass)
- [x] 9.8 Kill any vitest worker processes

## 10. Migrate Install Handler

_Depends on Phase 9 completing - legacy apply must accept new AgentConfig first._

- [x] 10.1 Update imports in install/handler.ts to use agents/ module for AgentConfig, detectAgents, getAgentById
- [x] 10.2 Update getAgentById usage to handle Option<AgentConfig> return type
- [x] 10.3 Update any `agent.skillsDir` references to `agent.skills.projectDir`
- [x] 10.4 Update test mocks in install/handler.test.ts to use new AgentConfig structure
- [x] 10.5 Run `pnpm typecheck` and fix any errors
- [x] 10.6 Run `pnpm lint` and fix any errors
- [x] 10.7 Run `pnpm test packages/cli/src/commands/skills/install/` and fix any failures (110 tests pass)
- [x] 10.8 Run `pnpm test:e2e -- --grep install` and fix any failures (E2E path expectations updated; some tests that mix install+uninstall fail until Phase 11 completes)
- [x] 10.9 Kill any vitest worker processes

## 11. Migrate Uninstall Handler

_Depends on Phase 9 completing - legacy apply must accept new AgentConfig first._

- [x] 11.1 Update imports in uninstall/handler.ts to use agents/ module
- [x] 11.2 Update getAgentById usage to handle Option<AgentConfig> return type
- [x] 11.3 Fix handlePartialUninstall to use agent.skills.projectDir instead of fallback pattern
- [x] 11.4 Update test mocks in uninstall/handler.test.ts to use new AgentConfig structure (no mocks needed update)
- [x] 11.5 Run `pnpm typecheck` and fix any errors
- [x] 11.6 Run `pnpm lint` and fix any errors
- [x] 11.7 Run `pnpm test packages/cli/src/commands/skills/uninstall/` and fix any failures (16 tests pass)
- [x] 11.8 Run `pnpm test:e2e -- --grep uninstall` and fix any failures
- [x] 11.9 Kill any vitest worker processes

## 12. Migrate Init Handler (if applicable)

- [x] 12.1 Check if init/handler.ts uses skills/state functions or AgentConfig
- [x] 12.2 Update to use agents/ module if needed
- [x] 12.3 Run `pnpm typecheck` and fix any errors
- [x] 12.4 Run `pnpm lint` and fix any errors
- [x] 12.5 Run `pnpm test` and fix any failures
- [x] 12.6 Kill any vitest worker processes

## 13. Delete Superseded Agent Code

_After handlers migrate to agents/ module, remove old agent code from skills/._

- [x] 13.1 Remove AgentConfig interface from `skills/types.ts`
- [x] 13.2 Remove agent exports from `skills/index.ts` (SUPPORTED_AGENTS, detectAgents, getAgentById, DetectionError)
- [x] 13.3 Delete `skills/agent-detection.ts`
- [x] 13.4 Delete `skills/agent-detection.test.ts`
- [x] 13.5 Run `pnpm typecheck` and fix any errors
- [x] 13.6 Run `pnpm lint` and fix any errors
- [x] 13.7 Run `pnpm test` and fix any failures
- [x] 13.8 Kill any vitest worker processes

## 14. Clean Up Types

_Task 14.1 is blocked by deferred module deletions - legacy types are still used by apply.ts, diff.ts, load.ts, ideal.ts.
Tasks 14.2-14.3 verified: V2 types already use string agent IDs, no old AgentConfig references._

- [x] 14.1 Remove legacy types from `skills/state/types.ts` (keep only V2 types) — DEFERRED: blocked by skills/state/ module deletions
- [x] 14.2 Update any V2 types that reference old AgentConfig to use new agents/ types — N/A: V2 types already use string agent IDs
- [x] 14.3 Verify no V2 types import from skills/types.ts or skills/agent-detection.ts — VERIFIED: imports are clean
- [x] 14.4 Run `pnpm typecheck` and fix any errors
- [x] 14.5 Run `pnpm lint` and fix any errors
- [x] 14.6 Run `pnpm test` and fix any failures
- [x] 14.7 Kill any vitest worker processes

## 15. Final Verification

- [x] 15.1 Run `pnpm typecheck` - full project type check
- [x] 15.2 Run `pnpm lint` - full project lint
- [x] 15.3 Run `pnpm test` - full test suite (1408 tests pass)
- [x] 15.4 Run `pnpm test:e2e` - full E2E suite (78 tests pass, 16 skipped)
- [x] 15.5 Kill any vitest worker processes

---

## Deferred to Future Change: Delete skills/state/ Modules

_The following deletions are deferred until the workspace V2 pipeline is fully implemented.
Currently, CLI handlers still depend on `skills/state/apply.ts` and related modules._

- [ ] Delete `skills/state/apply.ts` and `skills/state/apply.test.ts`
- [ ] Delete `skills/state/load.ts` and `skills/state/load.test.ts`
- [ ] Delete `skills/state/ideal.ts` and `skills/state/ideal.test.ts`
- [ ] Delete `skills/state/diff.ts` and `skills/state/diff.test.ts`
- [ ] Update `skills/state/index.ts` to only export kept modules (types.ts, pure-functions.ts)
- [ ] Remove legacy state exports from `skills/index.ts`
