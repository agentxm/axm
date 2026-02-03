## 1. Core Types and Interfaces

- [ ] 1.1 Write tests for SkillSource discriminated union (Registry, GitHub, Local variants)
- [ ] 1.2 Implement SkillSource type with Effect Schema
- [ ] 1.3 Run typecheck and fix issues
- [ ] 1.4 Run lint and fix issues
- [ ] 1.5 Run tests and fix issues
- [ ] 1.6 Kill vitest workers

- [ ] 1.7 Write tests for issue types (ActualSkillIssue, SkillStateIssue, WorkspaceIssue)
- [ ] 1.8 Implement issue types with severity levels
- [ ] 1.9 Run typecheck and fix issues
- [ ] 1.10 Run lint and fix issues
- [ ] 1.11 Run tests and fix issues
- [ ] 1.12 Kill vitest workers

- [ ] 1.13 Write tests for ActualSkill, LockedSkill, SkillState, CurrentState types
- [ ] 1.14 Implement state types with issues arrays (replacing validity)
- [ ] 1.15 Run typecheck and fix issues
- [ ] 1.16 Run lint and fix issues
- [ ] 1.17 Run tests and fix issues
- [ ] 1.18 Kill vitest workers

- [ ] 1.19 Write tests for IdealSkill and IdealState types
- [ ] 1.20 Implement ideal state types
- [ ] 1.21 Run typecheck and fix issues
- [ ] 1.22 Run lint and fix issues
- [ ] 1.23 Run tests and fix issues
- [ ] 1.24 Kill vitest workers

- [ ] 1.25 Write tests for PlanStep discriminated union (InstallSkill, UpdateSkill, UninstallSkill)
- [ ] 1.26 Implement PlanStep and Plan types
- [ ] 1.27 Run typecheck and fix issues
- [ ] 1.28 Run lint and fix issues
- [ ] 1.29 Run tests and fix issues
- [ ] 1.30 Kill vitest workers

## 2. Schema Updates

- [ ] 2.1 Write tests for updated lockfile schema (gitTreeHash, agents, skills at root)
- [ ] 2.2 Update lockfile schema with new structure
- [ ] 2.3 Run typecheck and fix issues
- [ ] 2.4 Run lint and fix issues
- [ ] 2.5 Run tests and fix issues
- [ ] 2.6 Kill vitest workers

- [ ] 2.7 Write tests for updated settings schema (skills at root, SkillSettingsEntry union)
- [ ] 2.8 Update settings schema with new structure
- [ ] 2.9 Run typecheck and fix issues
- [ ] 2.10 Run lint and fix issues
- [ ] 2.11 Run tests and fix issues
- [ ] 2.12 Kill vitest workers

## 3. Pure Functions

- [ ] 3.1 Write tests for computeInstallPath (registry vs external paths)
- [ ] 3.2 Implement computeInstallPath function
- [ ] 3.3 Run typecheck and fix issues
- [ ] 3.4 Run lint and fix issues
- [ ] 3.5 Run tests and fix issues
- [ ] 3.6 Kill vitest workers

- [ ] 3.7 Write tests for collectIssues (flattens issues from all levels)
- [ ] 3.8 Implement collectIssues function
- [ ] 3.9 Run typecheck and fix issues
- [ ] 3.10 Run lint and fix issues
- [ ] 3.11 Run tests and fix issues
- [ ] 3.12 Kill vitest workers

- [ ] 3.13 Write tests for versionsEqual (semver comparison with fallback)
- [ ] 3.14 Implement versionsEqual function
- [ ] 3.15 Run typecheck and fix issues
- [ ] 3.16 Run lint and fix issues
- [ ] 3.17 Run tests and fix issues
- [ ] 3.18 Kill vitest workers

- [ ] 3.19 Write tests for buildPlan (current vs ideal diffing)
- [ ] 3.20 Implement buildPlan function
- [ ] 3.21 Run typecheck and fix issues
- [ ] 3.22 Run lint and fix issues
- [ ] 3.23 Run tests and fix issues
- [ ] 3.24 Kill vitest workers

- [ ] 3.25 Write tests for toSettingsEntry (source to settings conversion)
- [ ] 3.26 Implement toSettingsEntry function
- [ ] 3.27 Run typecheck and fix issues
- [ ] 3.28 Run lint and fix issues
- [ ] 3.29 Run tests and fix issues
- [ ] 3.30 Kill vitest workers

## 4. Workspace Context

- [ ] 4.1 Write tests for makeWorkspaceContext (local vs global paths)
- [ ] 4.2 Implement makeWorkspaceContext function
- [ ] 4.3 Run typecheck and fix issues
- [ ] 4.4 Run lint and fix issues
- [ ] 4.5 Run tests and fix issues
- [ ] 4.6 Kill vitest workers

- [ ] 4.7 Write tests for ensureInit (initialization check)
- [ ] 4.8 Implement ensureInit function
- [ ] 4.9 Run typecheck and fix issues
- [ ] 4.10 Run lint and fix issues
- [ ] 4.11 Run tests and fix issues
- [ ] 4.12 Kill vitest workers

## 5. State Loading

- [ ] 5.1 Write tests for loadCurrentState (merges actual + locked with issues)
- [ ] 5.2 Implement loadCurrentState function
- [ ] 5.3 Run typecheck and fix issues
- [ ] 5.4 Run lint and fix issues
- [ ] 5.5 Run tests and fix issues
- [ ] 5.6 Kill vitest workers

## 6. Ideal State Building

- [ ] 6.1 Write tests for buildIdealForInstall
- [ ] 6.2 Implement buildIdealForInstall function
- [ ] 6.3 Run typecheck and fix issues
- [ ] 6.4 Run lint and fix issues
- [ ] 6.5 Run tests and fix issues
- [ ] 6.6 Kill vitest workers

- [ ] 6.7 Write tests for buildIdealForUninstall
- [ ] 6.8 Implement buildIdealForUninstall function
- [ ] 6.9 Run typecheck and fix issues
- [ ] 6.10 Run lint and fix issues
- [ ] 6.11 Run tests and fix issues
- [ ] 6.12 Kill vitest workers

- [ ] 6.13 Write tests for buildIdealForUpdate
- [ ] 6.14 Implement buildIdealForUpdate function
- [ ] 6.15 Run typecheck and fix issues
- [ ] 6.16 Run lint and fix issues
- [ ] 6.17 Run tests and fix issues
- [ ] 6.18 Kill vitest workers

- [ ] 6.19 Write tests for buildIdealState (command dispatch)
- [ ] 6.20 Implement buildIdealState function
- [ ] 6.21 Run typecheck and fix issues
- [ ] 6.22 Run lint and fix issues
- [ ] 6.23 Run tests and fix issues
- [ ] 6.24 Kill vitest workers

## 7. Plan Application

- [ ] 7.1 Write tests for applyStep (InstallSkill, UpdateSkill, UninstallSkill)
- [ ] 7.2 Implement applyStep function
- [ ] 7.3 Run typecheck and fix issues
- [ ] 7.4 Run lint and fix issues
- [ ] 7.5 Run tests and fix issues
- [ ] 7.6 Kill vitest workers

- [ ] 7.7 Write tests for applyPlan (dry-run vs apply, progress callback, failure handling)
- [ ] 7.8 Implement applyPlan function
- [ ] 7.9 Run typecheck and fix issues
- [ ] 7.10 Run lint and fix issues
- [ ] 7.11 Run tests and fix issues
- [ ] 7.12 Kill vitest workers

## 8. CLI Handler Update

- [ ] 8.1 Write tests for skills install handler with reconciliation pattern
- [ ] 8.2 Update skills install handler to use new pattern
- [ ] 8.3 Run typecheck and fix issues
- [ ] 8.4 Run lint and fix issues
- [ ] 8.5 Run tests and fix issues
- [ ] 8.6 Kill vitest workers

- [ ] 8.7 Write tests for plan display format (action labels, agents)
- [ ] 8.8 Update plan display to use new format
- [ ] 8.9 Run typecheck and fix issues
- [ ] 8.10 Run lint and fix issues
- [ ] 8.11 Run tests and fix issues
- [ ] 8.12 Kill vitest workers

## 9. E2E Tests

- [ ] 9.1 Write E2E tests for skills install with new lockfile/settings format
- [ ] 9.2 Run E2E tests and fix issues
- [ ] 9.3 Kill vitest workers

## 10. Cleanup

- [ ] 10.1 Remove deprecated validity types and functions
- [ ] 10.2 Remove repair-related code
- [ ] 10.3 Run typecheck and fix issues
- [ ] 10.4 Run lint and fix issues
- [ ] 10.5 Run tests and fix issues
- [ ] 10.6 Kill vitest workers
- [ ] 10.7 Update code comments to reference design doc
