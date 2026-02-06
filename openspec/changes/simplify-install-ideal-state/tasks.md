## 1. Unify Source types

- [ ] 1.1 Replace `SkillSourceV2` with `Source` (from `sources/types.ts`) in state types: `IdealSkillV2`, `LockedSkillV2`, `SkillStateV2` in `extensions/skills/state/types.ts`. Delete `SkillSourceV2`.
- [ ] 1.2 Update `sourceV2ToLockEntry` in `workspace/apply.ts` to handle all `Source` variants (github, gitlab, bitbucket, azurerepos, git, registry, local).
- [ ] 1.3 Update `sourceV2ToSettingsValue` in `workspace/apply.ts` to handle all `Source` variants.
- [ ] 1.4 Update `parseSourceFromEntry` in `workspace/load-state.ts` to return `Source` and handle all source discriminators.
- [ ] 1.5 Update `sourcesEqual` in `workspace/ideal-state.ts` to compare `Source` variants.
- [ ] 1.6 Update `formatSourceV2` in `cli-commands/skills/display.ts` to use `printSource` (or handle `Source` directly).
- [ ] 1.7 Update barrel exports — remove `SkillSourceV2` from `extensions/skills/state/index.ts`.
- [ ] 1.8 Run `pnpm typecheck` and fix any errors.
- [ ] 1.9 Run `pnpm test` and fix any failures.
- [ ] 1.10 Run `pnpm lint` and fix any errors.

## 2. Define WorkspaceOperation types and new buildIdealState

- [ ] 2.1 Rewrite tests in `ideal-state.test.ts`: replace `InstallCommand`/`UninstallCommand` + `BuildIdealDeps` mocks with `AddSkillOperation[]`/`RemoveSkillOperation[]` passed to `buildIdealState`. Tests should fail (red).
- [ ] 2.2 Add `AddSkillOperation`, `RemoveSkillOperation`, `WorkspaceOperation` types to `ideal-state.ts`. Keep `DiscoveredSkill` as `{ name, version, gitTreeHash }`.
- [ ] 2.3 Implement `buildIdealState(current, ops)` as a fold: start from current state's locked skills, apply each operation.
- [ ] 2.4 Remove `InstallCommand`, `UninstallCommand`, `Command` types. Remove `BuildIdealDeps`, `BuildIdealStateDeps` interfaces. Remove `buildIdealForInstall`, `buildIdealForUninstall`, old `buildIdealState`.
- [ ] 2.5 Keep `UpdateCommand`, `BuildIdealUpdateDeps`, `buildIdealForUpdate` as-is (deferred migration).
- [ ] 2.6 Update barrel exports in `workspace/index.ts`.
- [ ] 2.7 Run tests: `pnpm test -- --run packages/cli/src/workspace/ideal-state.test.ts` — all should pass (green).
- [ ] 2.8 Run `pnpm typecheck` and fix any errors.
- [ ] 2.9 Run `pnpm lint` and fix any errors.

## 3. Update install handler

- [ ] 3.1 Remove `createBuildIdealDeps`, `sourceToV2` from `handler.ts`.
- [ ] 3.2 Build `AddSkillOperation[]` from selected skills using `source` from `parseSource` directly.
- [ ] 3.3 Call `buildIdealState(currentState, ops)`.
- [ ] 3.4 Remove unused imports.
- [ ] 3.5 Run `pnpm typecheck` and fix any errors.
- [ ] 3.6 Run `pnpm lint` and fix any errors.

## 4. Update uninstall handler

- [ ] 4.1 Update `handler.ts` in `skills/uninstall/`: build `RemoveSkillOperation[]` instead of `UninstallCommand`. Call `buildIdealState(currentState, ops)`.
- [ ] 4.2 Update `handler.test.ts` if it references `UninstallCommand` or `buildIdealForUninstall`.
- [ ] 4.3 Run `pnpm typecheck` and fix any errors.
- [ ] 4.4 Run `pnpm lint` and fix any errors.

## 5. Verification

- [ ] 5.1 Run `pnpm test` — all tests pass.
- [ ] 5.2 Run `pnpm test:e2e` — all e2e tests pass.
- [ ] 5.3 Kill any vitest worker processes.
