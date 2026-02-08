## 1. SettingsService Core

- [x] 1.1 Write tests for SettingsService (queries: getScope, getAgents, getSkills; mutations: addSkill, removeSkill, addAgent; auto-creation of settings file; semaphore serialization; path resolution from Workspace)
- [x] 1.2 Implement `SettingsService` in `settings/service.ts` — Context.Tag, interface with 6 methods, layer with Semaphore(1), depends on Workspace + FileSystem. Internal `readOrCreate` helper auto-creates `settings.json` with `{}` if missing. Mutations acquire semaphore for full read-modify-write cycle; queries do not
- [x] 1.3 Typecheck, lint, test, e2e, kill vitest workers

## 2. Barrel and Export Cleanup

- [x] 2.1 Update `settings/index.ts` barrel: export `SettingsService` (tag + type + layer); remove exports of `readSettings`, `writeSettings`, `updateSettings`, `addSkill`, `addAgentToWorkspace`, `getEffectiveScope`, `ensureInitializedLegacy`, `SettingsUpdate`, `SkillsUpdate`, `EnsureInitializedLegacyOptions`. Keep: error types, schema types, `createDefaultSettings`, `DEFAULT_SCOPE`, `SETTINGS_FILENAME`
- [x] 2.2 Fix all import errors across the codebase caused by removed barrel exports — callers that still need raw functions import directly from `settings/settings.ts` (workspace init only); all other callers migrate to `SettingsService`
- [x] 2.3 Typecheck, lint, test, e2e, kill vitest workers

## 3. Remove `getSettings()` from WorkspaceContextService

- [x] 3.1 Update tests for `WorkspaceContextService` to remove `getSettings` from the interface and any test assertions that use it
- [x] 3.2 Remove `getSettings()` from `WorkspaceContextService` interface and `layer` implementation in `workspace/service.ts`
- [x] 3.3 Fix all callers that used `context.getSettings()` or `ws.getSettings()` — migrate to `SettingsService.getAgents()` / `SettingsService.getScope()` as appropriate
- [x] 3.4 Typecheck, lint, test, e2e, kill vitest workers

## 4. Migrate ensure-agents

- [x] 4.1 Update `ensure-agents.test.ts` — replace `addAgentToWorkspace` expectations with `SettingsService.addAgent()` calls; remove `getSettings` from options; remove `concurrency: 1` assertions
- [x] 4.2 Migrate `workspace/ensure-agents.ts` to use `SettingsService.addAgent()` instead of `addAgentToWorkspace()`; remove `concurrency: 1` workaround (semaphore handles serialization); remove `getSettings` from `EnsureAgentsOptions`
- [x] 4.3 Typecheck, lint, test, e2e, kill vitest workers

## 5. Migrate install handler and executor

- [x] 5.1 Update install handler test — replace `ws.getSettings()` usage with `SettingsService.getAgents()` mock; provide `SettingsService` in test layer
- [x] 5.2 Migrate `install/handler.ts` to read agents via `SettingsService.getAgents()` instead of `(yield* ws.getSettings()).agents ?? []`
- [x] 5.3 Update install-skill tests — add expectations that `SettingsService.addSkill()` is called after successful installation with skill name and source string; verify failure is swallowed
- [x] 5.4 Add `SettingsService.addSkill()` call to `install-skill.ts` after successful lockfile update — swallow errors (consistent with lockfile error handling)
- [x] 5.5 Typecheck, lint, test, e2e, kill vitest workers

## 6. Migrate uninstall executor

- [x] 6.1 Update uninstall-skill tests — add expectations that `SettingsService.removeSkill()` is called after full uninstall only (not partial); verify failure is swallowed
- [x] 6.2 Add `SettingsService.removeSkill()` call to `uninstall-skill.ts` after successful full removal — swallow errors; skip for partial uninstalls
- [x] 6.3 Typecheck, lint, test, e2e, kill vitest workers

## 7. Migrate init handler

- [x] 7.1 Update init handler test — replace `context.getSettings()` with `SettingsService.getAgents()` mock; provide `SettingsService` in test layer
- [x] 7.2 Migrate `init/handler.ts` to read agents via `SettingsService.getAgents()` instead of `context.getSettings()`
- [x] 7.3 Typecheck, lint, test, e2e, kill vitest workers

## 8. Final Cleanup

- [x] 8.1 Remove dead code: `getEffectiveScope` and `ensureInitializedLegacy` from `settings/settings.ts`; remove `SettingsUpdate` and `SkillsUpdate` types if no longer used internally
- [x] 8.2 Verify no remaining imports of removed functions across the codebase (grep for old function names)
- [x] 8.3 Typecheck, lint, test, e2e, kill vitest workers
