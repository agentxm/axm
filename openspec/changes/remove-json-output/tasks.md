## 1. Update E2E Tests

- [ ] 1.1 Update `skills-install-dry-run.test.ts` to remove JSON output assertions and use text-based verification
- [ ] 1.2 Run `pnpm test:e2e` to verify E2E tests pass (expect failures until implementation)

## 2. Remove CLI Flags

- [ ] 2.1 Remove global `--json` option from `packages/cli/src/main.ts`
- [ ] 2.2 Remove `json` from `InitArgs` interface in `packages/cli/src/commands/init/command.ts`
- [ ] 2.3 Remove `--json` flag and examples from `packages/cli/src/commands/skills/install/command.ts`
- [ ] 2.4 Remove `--json` flag and examples from `packages/cli/src/commands/skills/uninstall/command.ts`
- [ ] 2.5 Run `pnpm typecheck` and fix any type errors

## 3. Remove Handler Logic

- [ ] 3.1 Remove JSON output logic from install handler (`outputPlanJson`, `showOutput`, conditional blocks)
- [ ] 3.2 Remove JSON output logic from uninstall handler (`outputPlanJsonV2`, `outputPartialPlanJson`, `showOutput`, conditional blocks)
- [ ] 3.3 Run `pnpm typecheck` and fix any type errors

## 4. Remove Core Utilities

- [ ] 4.1 Remove JSON types and conversion functions from `packages/core/src/experimental/workspace/plan.ts` (`PlanJson`, `PlanStepJson`, `SkillSourceJson`, `planToJson`, `sourceToJson`, `stepToJson`)
- [ ] 4.2 Remove JSON exports from `packages/core/src/experimental/workspace/index.ts`
- [ ] 4.3 Run `pnpm typecheck` and fix any type errors

## 5. Final Verification

- [ ] 5.1 Run `pnpm lint` and fix any linting errors
- [ ] 5.2 Run `pnpm test` and fix any test failures
- [ ] 5.3 Run `pnpm test:e2e` and fix any E2E test failures
- [ ] 5.4 Kill any remaining vitest worker processes
