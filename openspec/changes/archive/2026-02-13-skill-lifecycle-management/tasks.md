> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. SkillEntry Schema & Normalization

> **Subagent:** Run this entire phase in a single subagent.

Foundation types and functions for the enriched skill entry model. Everything downstream depends on this phase.

- [ ] 1.1 Add tests for `SkillEntrySchema` parsing: string, `SkillEntryObjectSchema`, `UnmanagedSkillEntrySchema`, and invalid input rejection
- [ ] 1.2 Add tests for `normalizeSkillEntry`: string → normalized, object with enabled → normalized, object with defaults → normalized, unmanaged → normalized
- [ ] 1.3 Add tests for `collapseSkillEntry`: all-defaults → string, enabled false → object, unmanaged → `{ managed: false }`
- [ ] 1.4 Implement `SkillEntryObjectSchema` (`{ source: string, enabled?: boolean }`), `UnmanagedSkillEntrySchema` (`{ managed: false }`), and `SkillEntrySchema` union in `packages/cli/src/settings/schema.ts`
- [ ] 1.5 Implement `NormalizedSkillEntry` type (`{ source: Option<string>, enabled: boolean, managed: boolean }`) and `normalizeSkillEntry` / `collapseSkillEntry` functions in `packages/cli/src/settings/`
- [ ] 1.6 Update `SkillsMapSchema` value type from `Schema.String` to `SkillEntrySchema`
- [ ] 1.7 Run `pnpm typecheck` and fix any errors
- [ ] 1.8 Run `pnpm lint` and fix any errors
- [ ] 1.9 Run `pnpm test` and fix any failures
- [ ] 1.10 Run `pnpm test:e2e` and fix any failures
- [ ] 1.11 Kill any vitest worker processes

## 2. Workspace Service Changes

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1. Modify existing workspace methods and add new ones for enriched entry access.

- [ ] 2.1 Add tests for `getConfiguredSkills()`: returns all entries (managed + unmanaged) normalized
- [ ] 2.2 Add tests for modified `getInstalledSkills()`: returns only managed entries, return type is `ReadonlyRecord<string, NormalizedSkillEntry>`
- [ ] 2.3 Add tests for `updateSkillEntry(name, updater)`: applies updater and collapses, fails for missing skill
- [ ] 2.4 Add tests for `renameSkill(oldName, newName)`: atomically renames settings and lockfile keys, fails for missing skill
- [ ] 2.5 Add tests for `updateLockEntryAgents(name, agents)`: updates lock entry agents, fails for missing lock entry
- [ ] 2.6 Implement `getConfiguredSkills()` on `WorkspaceContextService`
- [ ] 2.7 Modify `getInstalledSkills()` return type to `ReadonlyRecord<string, NormalizedSkillEntry>`, filter to `managed: true`
- [ ] 2.8 Implement `updateSkillEntry(name, updater)` with mutex protection
- [ ] 2.9 Implement `renameSkill(oldName, newName)` with mutex protection
- [ ] 2.10 Implement `updateLockEntryAgents(name, agents)` with mutex protection
- [ ] 2.11 Update existing callers of `getInstalledSkills()` to work with the new return type
- [ ] 2.12 Run `pnpm typecheck` and fix any errors
- [ ] 2.13 Run `pnpm lint` and fix any errors
- [ ] 2.14 Run `pnpm test` and fix any failures
- [ ] 2.15 Run `pnpm test:e2e` and fix any failures
- [ ] 2.16 Kill any vitest worker processes

## 3. New Operation Types & Handlers

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2. Define the three new operation types and their execution handlers.

- [ ] 3.1 Add tests for `enableSkill` handler: reads workspace state, re-resolves source, installs files, updates lock agents, updates settings entry; files-before-state ordering
- [ ] 3.2 Add tests for `disableSkill` handler: reads workspace state, removes symlinks and canonical dirs, clears lock agents, marks disabled; files-before-state ordering
- [ ] 3.3 Add tests for `renameSkill` handler: reads workspace state, renames canonical dir, updates symlinks, renames settings/lockfile keys, syncs lock agents; files-before-state ordering
- [ ] 3.4 Define `EnableSkillOperation`, `DisableSkillOperation`, `RenameSkillOperation` types following the `Operation<TName, TArgs>` pattern
- [ ] 3.5 Implement `enableSkill` operation handler: re-resolve source, install to canonical, create agent symlinks, update lock agents, update settings entry
- [ ] 3.6 Implement `disableSkill` operation handler: remove agent symlinks, remove canonical dirs, clear lock agents, update settings entry
- [ ] 3.7 Implement `renameSkill` operation handler: rename canonical dir, remove old symlinks, create new symlinks, rename settings/lockfile keys, sync lock agents
- [ ] 3.8 Run `pnpm typecheck` and fix any errors
- [ ] 3.9 Run `pnpm lint` and fix any errors
- [ ] 3.10 Run `pnpm test` and fix any failures
- [ ] 3.11 Run `pnpm test:e2e` and fix any failures
- [ ] 3.12 Kill any vitest worker processes

## 4. New CLI Commands — Enable, Disable, Rename

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 4.1–4.4, 4.5–4.8, and 4.9–4.12 are independent — launch as parallel subagents.

Depends on: Phase 3.

### Enable

- [ ] 4.1 Add tests for `enable` command parsing: positional `<name>`, standard flags (`--yes`, `--preview`, `--global`, `--non-interactive`)
- [ ] 4.2 Add tests for `handleEnable`: validates exists/managed/disabled, builds EnableSkillOperation, resolves plan; error cases (not found, unmanaged, already enabled)
- [ ] 4.3 Implement `skills/enable/command.ts` — yargs command definition
- [ ] 4.4 Implement `skills/enable/handler.ts` — load configured skills, validate, build operation, build plan, resolve via `ws.resolvePlan()`

### Disable

- [ ] 4.5 Add tests for `disable` command parsing: positional `<name>`, standard flags
- [ ] 4.6 Add tests for `handleDisable`: validates exists/managed/enabled, builds DisableSkillOperation, resolves plan; error cases (not found, unmanaged, already disabled)
- [ ] 4.7 Implement `skills/disable/command.ts` — yargs command definition
- [ ] 4.8 Implement `skills/disable/handler.ts` — load configured skills, validate, build operation, build plan, resolve via `ws.resolvePlan()`

### Rename

- [ ] 4.9 Add tests for `rename` command parsing: positionals `<old-name>` `<new-name>`, standard flags
- [ ] 4.10 Add tests for `handleRename`: validates old exists/managed, new doesn't conflict, builds RenameSkillOperation, resolves plan; error cases (not found, unmanaged, conflict)
- [ ] 4.11 Implement `skills/rename/command.ts` — yargs command definition
- [ ] 4.12 Implement `skills/rename/handler.ts` — load configured/locked skills, validate, build operation, build plan, resolve via `ws.resolvePlan()`

### Registration

- [ ] 4.13 Register `enableCommand`, `disableCommand`, `renameCommand` in `packages/cli/src/cli-commands/skills/command.ts`
- [ ] 4.14 Run `pnpm typecheck` and fix any errors
- [ ] 4.15 Run `pnpm lint` and fix any errors
- [ ] 4.16 Run `pnpm test` and fix any failures
- [ ] 4.17 Run `pnpm test:e2e` and fix any failures
- [ ] 4.18 Kill any vitest worker processes

## 5. Modified Update Handler & Build Plan

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 2 and 3. Can run in parallel with Phase 6.

- [ ] 5.1 Add tests for update handler skip conditions: disabled skills skipped with log message, unmanaged skills skipped with log message
- [ ] 5.2 Add tests for rename detection: single-skill source rename produces install + uninstall ops, multi-skill source logs warning and skips, resolution failure follows existing handling
- [ ] 5.3 Add tests for `buildUpdatePlan` accepting `InstallSkillOperation | UninstallSkillOperation`: UninstallSkillOperation steps get rename cleanup label/message
- [ ] 5.4 Update `buildUpdatePlan` to accept `ReadonlyArray<InstallSkillOperation | UninstallSkillOperation>` and handle UninstallSkillOperation steps
- [ ] 5.5 Update update handler to read from `getConfiguredSkills()`, filter by `managed: true` and `enabled: true`, log skip messages for filtered entries
- [ ] 5.6 Add rename detection logic to update handler: check single vs multi-skill sources, add install + uninstall ops or log warning
- [ ] 5.7 Update `resolvePlan` handler map to include `"uninstall-skill": uninstallSkill`
- [ ] 5.8 Run `pnpm typecheck` and fix any errors
- [ ] 5.9 Run `pnpm lint` and fix any errors
- [ ] 5.10 Run `pnpm test` and fix any failures
- [ ] 5.11 Run `pnpm test:e2e` and fix any failures
- [ ] 5.12 Kill any vitest worker processes

## 6. Modified Uninstall Handler

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2. Can run in parallel with Phase 5.

- [ ] 6.1 Add tests for unmanaged skill uninstall: bypasses plan system, removes settings marker, logs message
- [ ] 6.2 Update uninstall handler to check `managed` flag via `getConfiguredSkills()` before building plan
- [ ] 6.3 Implement unmanaged bypass: skip plan, call `ws.removeSkill(name)`, log removal message
- [ ] 6.4 Run `pnpm typecheck` and fix any errors
- [ ] 6.5 Run `pnpm lint` and fix any errors
- [ ] 6.6 Run `pnpm test` and fix any failures
- [ ] 6.7 Run `pnpm test:e2e` and fix any failures
- [ ] 6.8 Kill any vitest worker processes

## 7. E2E Tests & Final Verification

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 4, 5, and 6.

- [ ] 7.1 Add E2E tests for `axm skills enable`: enable a disabled skill, verify files restored and settings updated
- [ ] 7.2 Add E2E tests for `axm skills disable`: disable an enabled skill, verify files removed and settings preserved
- [ ] 7.3 Add E2E tests for `axm skills rename`: rename a skill, verify settings/lockfile keys and agent files updated
- [ ] 7.4 Add E2E tests for `axm skills update` skip conditions: disabled and unmanaged skills skipped with messages
- [ ] 7.5 Add E2E tests for `axm skills uninstall` with unmanaged skill: bypasses plan, removes marker
- [ ] 7.6 Run `pnpm typecheck` — final verification across all packages
- [ ] 7.7 Run `pnpm lint` — final verification across all packages
- [ ] 7.8 Run `pnpm test` — final verification across all packages
- [ ] 7.9 Run `pnpm test:e2e` — final verification across all packages
- [ ] 7.10 Kill any vitest worker processes
