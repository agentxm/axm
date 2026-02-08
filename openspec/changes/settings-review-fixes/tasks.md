## 1. Remove dead export and make error `cause` required

- [ ] 1.1 Remove `SettingsErrorTag` type from `settings.ts` and its export from `index.ts`
- [ ] 1.2 Make `cause` required (`readonly cause: unknown`) on `SettingsParseError` and `SettingsWriteError` in `settings.ts`
- [ ] 1.3 Update any tests that construct `SettingsParseError` or `SettingsWriteError` without `cause`
- [ ] 1.4 Run `pnpm typecheck` and fix any errors
- [ ] 1.5 Run `pnpm lint` and fix any errors
- [ ] 1.6 Run `pnpm test` and fix any failures
- [ ] 1.7 Run `pnpm test:e2e` and fix any failures
- [ ] 1.8 Kill any vitest worker processes

## 2. Extract shared skill-name filter in schema

- [ ] 2.1 Extract the duplicated `Schema.filter` callback from `ExtensionMapSchema` and `SkillsMapSchema` into a named `skillNameKeyFilter` function in `schema.ts`
- [ ] 2.2 Apply `skillNameKeyFilter` to both `ExtensionMapSchema` and `SkillsMapSchema` via `.pipe()`
- [ ] 2.3 Run `pnpm typecheck` and fix any errors
- [ ] 2.4 Run `pnpm lint` and fix any errors
- [ ] 2.5 Run `pnpm test` and fix any failures (schema tests should pass unchanged)
- [ ] 2.6 Run `pnpm test:e2e` and fix any failures
- [ ] 2.7 Kill any vitest worker processes

## 3. Replace type assertions in service

- [ ] 3.1 In `service.ts` `readOrCreate`, replace `({}) as Settings` with `createDefaultSettings()`
- [ ] 3.2 In `service.ts` `getSkills`, replace `{} as SkillsMap` with `{} satisfies SkillsMap`
- [ ] 3.3 Run `pnpm typecheck` and fix any errors
- [ ] 3.4 Run `pnpm lint` and fix any errors
- [ ] 3.5 Run `pnpm test` and fix any failures
- [ ] 3.6 Run `pnpm test:e2e` and fix any failures
- [ ] 3.7 Kill any vitest worker processes

## 4. Validate agent ID in addAgent

- [ ] 4.1 Add test in `service.test.ts` for the new "Invalid agent ID" scenario: calling `addAgent("not-a-real-agent")` fails with `SettingsParseError`
- [ ] 4.2 In `service.ts` `addAgent`, replace `agentId as AgentId` with `Schema.decodeUnknown(AgentIdSchema)` validation, failing with `SettingsParseError` on invalid input
- [ ] 4.3 Add test verifying no disk write occurs on invalid agent ID
- [ ] 4.4 Run `pnpm typecheck` and fix any errors
- [ ] 4.5 Run `pnpm lint` and fix any errors
- [ ] 4.6 Run `pnpm test` and fix any failures
- [ ] 4.7 Run `pnpm test:e2e` and fix any failures
- [ ] 4.8 Kill any vitest worker processes

## 5. Use `Path.Path` for path construction

- [ ] 5.1 Update `settings.ts` tests in `settings.test.ts` to provide `NodeContext.layer` instead of `NodeFileSystem.layer` alone (ensures `Path.Path` is available)
- [ ] 5.2 In `settings.ts`, add `Path.Path` dependency — yield `Path.Path` in `readSettings` and `writeSettings`, replace `getSettingsPath` string interpolation with `path.join(axmDir, SETTINGS_FILENAME)`
- [ ] 5.3 Update `service.ts` `SettingsServiceLive` to also yield `Path.Path` and provide it (alongside `FileSystem`) to inner `readSettings`/`writeSettings` calls
- [ ] 5.4 Update `service.test.ts` test layer to provide `NodeContext.layer` if not already
- [ ] 5.5 Run `pnpm typecheck` and fix any errors
- [ ] 5.6 Run `pnpm lint` and fix any errors
- [ ] 5.7 Run `pnpm test` and fix any failures
- [ ] 5.8 Run `pnpm test:e2e` and fix any failures
- [ ] 5.9 Kill any vitest worker processes

## 6. Fix barrel exports and imports

- [ ] 6.1 Add `readSettings` and `writeSettings` to `settings/index.ts` barrel exports
- [ ] 6.2 In `workspace/service.ts`, change `import { readSettings, writeSettings } from "../settings/settings.js"` to import from `"../settings/index.js"`
- [ ] 6.3 Run `pnpm typecheck` and fix any errors
- [ ] 6.4 Run `pnpm lint` and fix any errors
- [ ] 6.5 Run `pnpm test` and fix any failures
- [ ] 6.6 Run `pnpm test:e2e` and fix any failures
- [ ] 6.7 Kill any vitest worker processes
