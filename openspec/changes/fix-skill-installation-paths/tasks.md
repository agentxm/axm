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

- [ ] 8.1 Test applyStep InstallSkill copies to canonical + syncs to agents
- [ ] 8.2 Test applyStep UninstallSkill removes from agents + canonical
- [ ] 8.3 Test applyStep UpdateSkill removes old + installs new
- [ ] 8.4 Test applyPlan updates lockfile on success
- [ ] 8.5 Test applyPlan updates settings on success
- [ ] 8.6 Test applyPlan with dryRun: true makes no changes
- [ ] 8.7 Run `pnpm typecheck` and fix any errors
- [ ] 8.8 Run `pnpm lint` and fix any errors
- [ ] 8.9 Run `pnpm test packages/core/src/experimental/workspace/` and fix any failures
- [ ] 8.10 Kill any vitest worker processes

## 9. Migrate Install Handler

- [ ] 9.1 Update imports in install/handler.ts to use agents/ module
- [ ] 9.2 Update imports in install/handler.ts to use workspace/\* modules
- [ ] 9.3 Replace loadSkillsState with loadCurrentState
- [ ] 9.4 Replace buildIdealForInstall with buildIdealState
- [ ] 9.5 Replace computeDiff with buildPlan
- [ ] 9.6 Replace applyDiff with applyPlan
- [ ] 9.7 Update progress event handling for new API
- [ ] 9.8 Update test mocks in install/handler.test.ts to use new AgentConfig structure
- [ ] 9.9 Run `pnpm typecheck` and fix any errors
- [ ] 9.10 Run `pnpm lint` and fix any errors
- [ ] 9.11 Run `pnpm test` and fix any failures
- [ ] 9.12 Run `pnpm test:e2e -- --grep install` and fix any failures
- [ ] 9.13 Kill any vitest worker processes

## 10. Migrate Uninstall Handler

- [ ] 10.1 Update imports in uninstall/handler.ts to use agents/ module
- [ ] 10.2 Update imports in uninstall/handler.ts to use workspace/\* modules
- [ ] 10.3 Replace legacy pipeline calls with workspace V2
- [ ] 10.4 Fix handlePartialUninstall to use agent.skills.projectDir instead of fallback pattern
- [ ] 10.5 Update test mocks in uninstall/handler.test.ts to use new AgentConfig structure
- [ ] 10.6 Run `pnpm typecheck` and fix any errors
- [ ] 10.7 Run `pnpm lint` and fix any errors
- [ ] 10.8 Run `pnpm test` and fix any failures
- [ ] 10.9 Run `pnpm test:e2e -- --grep uninstall` and fix any failures
- [ ] 10.10 Kill any vitest worker processes

## 11. Migrate Init Handler (if applicable)

- [ ] 11.1 Check if init/handler.ts uses skills/state functions
- [ ] 11.2 Update to workspace pipeline if needed
- [ ] 11.3 Run `pnpm typecheck` and fix any errors
- [ ] 11.4 Run `pnpm lint` and fix any errors
- [ ] 11.5 Run `pnpm test` and fix any failures
- [ ] 11.6 Kill any vitest worker processes

## 12. Delete Superseded skills/state/ Modules

- [ ] 12.1 Delete `skills/state/apply.ts` and `skills/state/apply.test.ts`
- [ ] 12.2 Delete `skills/state/load.ts` and `skills/state/load.test.ts`
- [ ] 12.3 Delete `skills/state/ideal.ts` and `skills/state/ideal.test.ts`
- [ ] 12.4 Delete `skills/state/diff.ts` and `skills/state/diff.test.ts`
- [ ] 12.5 Update `skills/state/index.ts` to only export kept modules (types.ts, pure-functions.ts)
- [ ] 12.6 Remove legacy state exports from `skills/index.ts`
- [ ] 12.7 Run `pnpm typecheck` and fix any errors
- [ ] 12.8 Run `pnpm lint` and fix any errors
- [ ] 12.9 Run `pnpm test` and fix any failures
- [ ] 12.10 Kill any vitest worker processes

## 13. Delete Superseded Agent Code

- [ ] 13.1 Remove AgentConfig interface from `skills/types.ts`
- [ ] 13.2 Remove agent exports from `skills/index.ts` (SUPPORTED_AGENTS, detectAgents, getAgentById, DetectionError)
- [ ] 13.3 Delete `skills/agent-detection.ts`
- [ ] 13.4 Delete `skills/agent-detection.test.ts`
- [ ] 13.5 Run `pnpm typecheck` and fix any errors
- [ ] 13.6 Run `pnpm lint` and fix any errors
- [ ] 13.7 Run `pnpm test` and fix any failures
- [ ] 13.8 Kill any vitest worker processes

## 14. Clean Up Types

- [ ] 14.1 Remove legacy types from `skills/state/types.ts` (keep only V2 types)
- [ ] 14.2 Update any V2 types that reference old AgentConfig to use new agents/ types
- [ ] 14.3 Verify no V2 types import from skills/types.ts or skills/agent-detection.ts
- [ ] 14.4 Run `pnpm typecheck` and fix any errors
- [ ] 14.5 Run `pnpm lint` and fix any errors
- [ ] 14.6 Run `pnpm test` and fix any failures
- [ ] 14.7 Kill any vitest worker processes

## 15. Final Verification

- [ ] 15.1 Run `pnpm typecheck` - full project type check
- [ ] 15.2 Run `pnpm lint` - full project lint
- [ ] 15.3 Run `pnpm test` - full test suite
- [ ] 15.4 Run `pnpm test:e2e` - full E2E suite
- [ ] 15.5 Kill any vitest worker processes
