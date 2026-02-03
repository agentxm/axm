## 1. Core Types and Interfaces

- [x] 1.1 Write tests for SkillSource discriminated union (Registry, GitHub, Local variants)
- [x] 1.2 Implement SkillSource type with Effect Schema
- [x] 1.3 Run typecheck and fix issues
- [x] 1.4 Run lint and fix issues
- [x] 1.5 Run tests and fix issues
- [x] 1.6 Kill vitest workers

- [x] 1.7 Write tests for issue types (ActualSkillIssue, SkillStateIssue, WorkspaceIssue)
- [x] 1.8 Implement issue types with severity levels
- [x] 1.9 Run typecheck and fix issues
- [x] 1.10 Run lint and fix issues
- [x] 1.11 Run tests and fix issues
- [x] 1.12 Kill vitest workers

- [x] 1.13 Write tests for ActualSkill, LockedSkill, SkillState, CurrentState types
- [x] 1.14 Implement state types with issues arrays (replacing validity)
- [x] 1.15 Run typecheck and fix issues
- [x] 1.16 Run lint and fix issues
- [x] 1.17 Run tests and fix issues
- [x] 1.18 Kill vitest workers

- [x] 1.19 Write tests for IdealSkill and IdealState types
- [x] 1.20 Implement ideal state types
- [x] 1.21 Run typecheck and fix issues
- [x] 1.22 Run lint and fix issues
- [x] 1.23 Run tests and fix issues
- [x] 1.24 Kill vitest workers

- [x] 1.25 Write tests for PlanStep discriminated union (InstallSkill, UpdateSkill, UninstallSkill)
- [x] 1.26 Implement PlanStep and Plan types
- [x] 1.27 Run typecheck and fix issues
- [x] 1.28 Run lint and fix issues
- [x] 1.29 Run tests and fix issues
- [x] 1.30 Kill vitest workers

## 2. Schema Updates

- [x] 2.1 Write tests for updated lockfile schema (gitTreeHash, agents, skills at root)
- [x] 2.2 Update lockfile schema with new structure
- [x] 2.3 Run typecheck and fix issues
- [x] 2.4 Run lint and fix issues
- [x] 2.5 Run tests and fix issues
- [x] 2.6 Kill vitest workers

- [x] 2.7 Write tests for updated settings schema (skills at root, SkillSettingsEntry union)
- [x] 2.8 Update settings schema with new structure
- [x] 2.9 Run typecheck and fix issues
- [x] 2.10 Run lint and fix issues
- [x] 2.11 Run tests and fix issues
- [x] 2.12 Kill vitest workers

## 3. Pure Functions

- [x] 3.1 Write tests for computeInstallPath (registry vs external paths)
- [x] 3.2 Implement computeInstallPath function
- [x] 3.3 Run typecheck and fix issues
- [x] 3.4 Run lint and fix issues
- [x] 3.5 Run tests and fix issues
- [x] 3.6 Kill vitest workers

- [x] 3.7 Write tests for collectIssues (flattens issues from all levels)
- [x] 3.8 Implement collectIssues function
- [x] 3.9 Run typecheck and fix issues
- [x] 3.10 Run lint and fix issues
- [x] 3.11 Run tests and fix issues
- [x] 3.12 Kill vitest workers

- [x] 3.13 Write tests for versionsEqual (semver comparison with fallback)
- [x] 3.14 Implement versionsEqual function
- [x] 3.15 Run typecheck and fix issues
- [x] 3.16 Run lint and fix issues
- [x] 3.17 Run tests and fix issues
- [x] 3.18 Kill vitest workers

- [x] 3.19 Write tests for buildPlan (current vs ideal diffing)
- [x] 3.20 Implement buildPlan function
- [x] 3.21 Run typecheck and fix issues
- [x] 3.22 Run lint and fix issues
- [x] 3.23 Run tests and fix issues
- [x] 3.24 Kill vitest workers

- [x] 3.25 Write tests for toSettingsEntry (source to settings conversion)
- [x] 3.26 Implement toSettingsEntry function
- [x] 3.27 Run typecheck and fix issues
- [x] 3.28 Run lint and fix issues
- [x] 3.29 Run tests and fix issues
- [x] 3.30 Kill vitest workers

## 4. Workspace Context

- [x] 4.1 Write tests for makeWorkspaceContext (local vs global paths)
- [x] 4.2 Implement makeWorkspaceContext function
- [x] 4.3 Run typecheck and fix issues
- [x] 4.4 Run lint and fix issues
- [x] 4.5 Run tests and fix issues
- [x] 4.6 Kill vitest workers

- [x] 4.7 Write tests for ensureInit (initialization check)
- [x] 4.8 Implement ensureInit function
- [x] 4.9 Run typecheck and fix issues
- [x] 4.10 Run lint and fix issues
- [x] 4.11 Run tests and fix issues
- [x] 4.12 Kill vitest workers

## 5. State Loading

- [x] 5.1 Write tests for loadCurrentState (merges actual + locked with issues)
- [x] 5.2 Implement loadCurrentState function
- [x] 5.3 Run typecheck and fix issues
- [x] 5.4 Run lint and fix issues
- [x] 5.5 Run tests and fix issues
- [x] 5.6 Kill vitest workers

## 6. Ideal State Building

- [x] 6.1 Write tests for buildIdealForInstall
- [x] 6.2 Implement buildIdealForInstall function
- [x] 6.3 Run typecheck and fix issues
- [x] 6.4 Run lint and fix issues
- [x] 6.5 Run tests and fix issues
- [x] 6.6 Kill vitest workers

- [x] 6.7 Write tests for buildIdealForUninstall
- [x] 6.8 Implement buildIdealForUninstall function
- [x] 6.9 Run typecheck and fix issues
- [x] 6.10 Run lint and fix issues
- [x] 6.11 Run tests and fix issues
- [x] 6.12 Kill vitest workers

- [x] 6.13 Write tests for buildIdealForUpdate
- [x] 6.14 Implement buildIdealForUpdate function
- [x] 6.15 Run typecheck and fix issues
- [x] 6.16 Run lint and fix issues
- [x] 6.17 Run tests and fix issues
- [x] 6.18 Kill vitest workers

- [x] 6.19 Write tests for buildIdealState (command dispatch)
- [x] 6.20 Implement buildIdealState function
- [x] 6.21 Run typecheck and fix issues
- [x] 6.22 Run lint and fix issues
- [x] 6.23 Run tests and fix issues
- [x] 6.24 Kill vitest workers

## 7. Plan Application

- [x] 7.1 Write tests for applyStep (InstallSkill, UpdateSkill, UninstallSkill)
- [x] 7.2 Implement applyStep function
- [x] 7.3 Run typecheck and fix issues
- [x] 7.4 Run lint and fix issues
- [x] 7.5 Run tests and fix issues
- [x] 7.6 Kill vitest workers

- [x] 7.7 Write tests for applyPlan (dry-run vs apply, progress callback, failure handling)
- [x] 7.8 Implement applyPlan function
- [x] 7.9 Run typecheck and fix issues
- [x] 7.10 Run lint and fix issues
- [x] 7.11 Run tests and fix issues
- [x] 7.12 Kill vitest workers

## 8. CLI Handler Update

- [x] 8.1 Write tests for skills install handler with reconciliation pattern
- [x] 8.2 Update skills install handler to use new pattern
- [x] 8.3 Run typecheck and fix issues
- [x] 8.4 Run lint and fix issues
- [x] 8.5 Run tests and fix issues
- [x] 8.6 Kill vitest workers

- [x] 8.7 Write tests for plan display format (action labels, agents)
- [x] 8.8 Update plan display to use new format
- [x] 8.9 Run typecheck and fix issues
- [x] 8.10 Run lint and fix issues
- [x] 8.11 Run tests and fix issues
- [x] 8.12 Kill vitest workers

## 9. E2E Tests

- [x] 9.1 Write E2E tests for skills install with new lockfile/settings format
- [x] 9.2 Run E2E tests and fix issues
- [x] 9.3 Kill vitest workers

## 10. Cleanup

- [x] 10.1 Remove deprecated validity types and functions
- [x] 10.2 Remove repair-related code
- [x] 10.3 Run typecheck and fix issues
- [x] 10.4 Run lint and fix issues
- [x] 10.5 Run tests and fix issues
- [x] 10.6 Kill vitest workers
- [x] 10.7 Update code comments to reference design doc
