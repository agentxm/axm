## 1. Remove dead export and make error `cause` required

- [x] 1.1 Remove `SettingsErrorTag` type from `settings.ts` and its export from `index.ts`
- [x] 1.2 Make `cause` required (`readonly cause: unknown`) on `SettingsParseError` and `SettingsWriteError` in `settings.ts`
- [x] 1.3 Update any tests that construct `SettingsParseError` or `SettingsWriteError` without `cause`
- [x] 1.4 Run `pnpm typecheck` and fix any errors
- [x] 1.5 Run `pnpm lint` and fix any errors
- [x] 1.6 Run `pnpm test` and fix any failures
- [x] 1.7 Run `pnpm test:e2e` and fix any failures
- [x] 1.8 Kill any vitest worker processes

## 2. Extract shared skill-name filter in schema

- [x] 2.1 Extract the duplicated `Schema.filter` callback from `ExtensionMapSchema` and `SkillsMapSchema` into a named `skillNameKeyFilter` function in `schema.ts`
- [x] 2.2 Apply `skillNameKeyFilter` to both `ExtensionMapSchema` and `SkillsMapSchema` via `.pipe()`
- [x] 2.3 Run `pnpm typecheck` and fix any errors
- [x] 2.4 Run `pnpm lint` and fix any errors
- [x] 2.5 Run `pnpm test` and fix any failures (schema tests should pass unchanged)
- [x] 2.6 Run `pnpm test:e2e` and fix any failures
- [x] 2.7 Kill any vitest worker processes

## 3. Replace type assertions in service

- [x] 3.1 In `service.ts` `readOrCreate`, replace `({}) as Settings` with `createDefaultSettings()`
- [x] 3.2 In `service.ts` `getSkills`, replace `{} as SkillsMap` with `{} satisfies SkillsMap`
- [x] 3.3 Run `pnpm typecheck` and fix any errors
- [x] 3.4 Run `pnpm lint` and fix any errors
- [x] 3.5 Run `pnpm test` and fix any failures
- [x] 3.6 Run `pnpm test:e2e` and fix any failures
- [x] 3.7 Kill any vitest worker processes

## 4. Validate agent ID in addAgent

- [x] 4.1 Add test in `service.test.ts` for the new "Invalid agent ID" scenario: calling `addAgent("not-a-real-agent")` fails with `SettingsParseError`
- [x] 4.2 In `service.ts` `addAgent`, replace `agentId as AgentId` with `Schema.decodeUnknown(AgentIdSchema)` validation, failing with `SettingsParseError` on invalid input
- [x] 4.3 Add test verifying no disk write occurs on invalid agent ID
- [x] 4.4 Run `pnpm typecheck` and fix any errors
- [x] 4.5 Run `pnpm lint` and fix any errors
- [x] 4.6 Run `pnpm test` and fix any failures
- [x] 4.7 Run `pnpm test:e2e` and fix any failures
- [x] 4.8 Kill any vitest worker processes

## 5. Use `Path.Path` for path construction

- [x] 5.1 Update `settings.ts` tests in `settings.test.ts` to provide `NodeContext.layer` instead of `NodeFileSystem.layer` alone (ensures `Path.Path` is available)
- [x] 5.2 In `settings.ts`, add `Path.Path` dependency — yield `Path.Path` in `readSettings` and `writeSettings`, replace `getSettingsPath` string interpolation with `path.join(axmDir, SETTINGS_FILENAME)`
- [x] 5.3 Update `service.ts` `SettingsServiceLive` to also yield `Path.Path` and provide it (alongside `FileSystem`) to inner `readSettings`/`writeSettings` calls
- [x] 5.4 Update `service.test.ts` test layer to provide `NodeContext.layer` if not already
- [x] 5.5 Run `pnpm typecheck` and fix any errors
- [x] 5.6 Run `pnpm lint` and fix any errors
- [x] 5.7 Run `pnpm test` and fix any failures
- [x] 5.8 Run `pnpm test:e2e` and fix any failures
- [x] 5.9 Kill any vitest worker processes

## 6. Fix barrel exports and imports

- [x] 6.1 Add `readSettings` and `writeSettings` to `settings/index.ts` barrel exports
- [x] 6.2 In `workspace/service.ts`, change `import { readSettings, writeSettings } from "../settings/settings.js"` to import from `"../settings/index.js"`
- [x] 6.3 Run `pnpm typecheck` and fix any errors
- [x] 6.4 Run `pnpm lint` and fix any errors
- [x] 6.5 Run `pnpm test` and fix any failures
- [x] 6.6 Run `pnpm test:e2e` and fix any failures
- [x] 6.7 Kill any vitest worker processes
