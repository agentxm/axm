## 1. Create extension-sources module

- [ ] 1.1 Create `packages/core/src/experimental/schemas/extension-sources.ts` with `SourceSchema` and `SourceType`
- [ ] 1.2 Add tests for `SourceSchema` validation (valid/invalid source types)
- [ ] 1.3 Run typecheck and fix any errors
- [ ] 1.4 Run linting and fix any errors
- [ ] 1.5 Run tests and fix any failures
- [ ] 1.6 Kill vitest worker processes

## 2. Update lockfile schema

- [ ] 2.1 Update tests in `lockfile.test.ts` to expect `SourceSchema` import from extension-sources
- [ ] 2.2 Replace `LockSourceTypeSchema` in `lockfile.ts` with import from `extension-sources`
- [ ] 2.3 Remove `LockSourceTypeSchema` and `LockSourceType` exports from lockfile.ts
- [ ] 2.4 Run typecheck and fix any errors
- [ ] 2.5 Run linting and fix any errors
- [ ] 2.6 Run tests and fix any failures
- [ ] 2.7 Kill vitest worker processes

## 3. Simplify settings schema

- [ ] 3.1 Update tests in `settings.test.ts` for new `Record<string, string>` skills format
- [ ] 3.2 Remove `GitHubSettingsEntrySchema`, `LocalSettingsEntrySchema`, `SkillSettingsEntrySchema` from settings.ts
- [ ] 3.3 Replace `SkillsMapSchema` with simple `Record<string, string>` schema
- [ ] 3.4 Update `SettingsSchema` to use the new simplified skills schema
- [ ] 3.5 Run typecheck and fix any errors
- [ ] 3.6 Run linting and fix any errors
- [ ] 3.7 Run tests and fix any failures
- [ ] 3.8 Kill vitest worker processes

## 4. Final verification

- [ ] 4.1 Run full test suite (`pnpm test`)
- [ ] 4.2 Run full typecheck (`pnpm typecheck`)
- [ ] 4.3 Run full lint (`pnpm lint`)
- [ ] 4.4 Kill vitest worker processes
