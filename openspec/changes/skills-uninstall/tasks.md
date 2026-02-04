## 1. Core: Remove Skill Function

- [ ] 1.1 Write tests for `removeSkillFromAgents` in `packages/core/src/experimental/skills/install.test.ts`
- [ ] 1.2 Implement `removeSkillFromAgents(skillName, agents, axmDir)` in `packages/core/src/experimental/skills/install.ts`
- [ ] 1.3 Export `removeSkillFromAgents` from `packages/core/src/experimental/skills/index.ts`
- [ ] 1.4 Run `pnpm typecheck && pnpm lint:fix && pnpm test` and fix any errors
- [ ] 1.5 Kill vitest worker processes

## 2. Core: Build Ideal for Uninstall

- [ ] 2.1 Write tests for `buildIdealForUninstall` in `packages/core/src/experimental/skills/state/ideal.test.ts`
- [ ] 2.2 Implement `buildIdealForUninstall(currentState, skillName, options)` in `packages/core/src/experimental/skills/state/ideal.ts`
- [ ] 2.3 Export `buildIdealForUninstall` from `packages/core/src/experimental/skills/state/index.ts`
- [ ] 2.4 Run `pnpm typecheck && pnpm lint:fix && pnpm test` and fix any errors
- [ ] 2.5 Kill vitest worker processes

## 3. Core: Settings Removal

- [ ] 3.1 Write tests for settings removal (null value support) in `packages/core/src/experimental/skills/settings.test.ts`
- [ ] 3.2 Update `updateSettings` to handle `null` values for skill removal
- [ ] 3.3 Run `pnpm typecheck && pnpm lint:fix && pnpm test` and fix any errors
- [ ] 3.4 Kill vitest worker processes

## 4. CLI: Uninstall Command Structure

- [ ] 4.1 Create `packages/cli/src/commands/skills/uninstall.ts` with yargs command definition
- [ ] 4.2 Wire uninstall command into skills parent command
- [ ] 4.3 Run `pnpm typecheck && pnpm lint:fix` and fix any errors

## 5. CLI: Uninstall Handler

- [ ] 5.1 Write handler tests in `packages/cli/src/commands/skills/uninstall/handler.test.ts`
- [ ] 5.2 Implement `handleUninstall` in `packages/cli/src/commands/skills/uninstall/handler.ts`
- [ ] 5.3 Run `pnpm typecheck && pnpm lint:fix && pnpm test` and fix any errors
- [ ] 5.4 Kill vitest worker processes

## 6. E2E Tests

- [ ] 6.1 Write E2E tests in `packages/cli/e2e/skills-uninstall.test.ts`
- [ ] 6.2 Run `pnpm test:e2e` and fix any errors
- [ ] 6.3 Kill vitest worker processes

## 7. Final Verification

- [ ] 7.1 Run full verification: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`
- [ ] 7.2 Manual smoke test: install a skill, then uninstall it
