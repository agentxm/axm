## Why

A code review of the settings module found convention violations, dead exports, type safety gaps, and code duplication. These issues accumulate as technical debt — inconsistent error types make wrapping unreliable, type assertions bypass validation, barrel bypasses break encapsulation, and duplicated schema logic invites divergence.

## What Changes

- Replace string concatenation path construction in `settings.ts` with `@effect/platform` `Path.join`
- Remove unused `SettingsErrorTag` type export from `settings.ts` and `index.ts`
- Make `cause` required (not optional) on `SettingsParseError` and `SettingsWriteError`
- Remove `as Settings` and `as SkillsMap` type assertions in `service.ts`, replacing with `satisfies` or helper functions
- Validate `agentId` in `SettingsService.addAgent` using `AgentIdSchema` instead of type-asserting with `as AgentId`
- Fix `workspace/service.ts` barrel bypass — import `readSettings`/`writeSettings` from `../settings/index.js` (and export them from the barrel if not already)
- Extract shared skill-name validation filter from duplicated `ExtensionMapSchema` / `SkillsMapSchema` logic in `schema.ts`

## Capabilities

### New Capabilities

_(none — all changes are internal refactors to existing code)_

### Modified Capabilities

- `settings-service`: `addAgent` now validates the agent ID against `AgentIdSchema` and fails with a typed error for invalid IDs (previously accepted any string and type-asserted internally)

## Impact

- **settings/settings.ts**: New `Path.Path` service dependency in `readSettings` and `writeSettings` signatures (adds `Path.Path` to the `R` channel)
- **settings/service.ts**: Type assertion removals, `addAgent` gains a new error path for invalid agent IDs
- **settings/schema.ts**: Internal refactor of shared filter — no public API change
- **settings/index.ts**: `SettingsErrorTag` removed from exports; `readSettings`/`writeSettings` confirmed exported
- **workspace/service.ts**: Import path change only (barrel instead of direct module import)
- **Test files**: Update `as Settings` type assertions and adjust for required `cause` on error types
