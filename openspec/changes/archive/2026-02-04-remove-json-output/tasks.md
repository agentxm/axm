## 1. Update E2E Tests

- [x] 1.1 Update `skills-install-dry-run.test.ts` to remove JSON output assertions and use text-based verification
- [x] 1.2 Run `pnpm test:e2e` to verify E2E tests pass (expect failures until implementation)

## 2. Remove CLI Flags

- [x] 2.1 Remove global `--json` option from `packages/cli/src/main.ts`
- [x] 2.2 Remove `json` from `InitArgs` interface in `packages/cli/src/commands/init/command.ts`
- [x] 2.3 Remove `--json` flag and examples from `packages/cli/src/commands/skills/install/command.ts`
- [x] 2.4 Remove `--json` flag and examples from `packages/cli/src/commands/skills/uninstall/command.ts`
- [x] 2.5 Run `pnpm typecheck` and fix any type errors

## 3. Remove Handler Logic

- [x] 3.1 Remove JSON output logic from install handler (`outputPlanJson`, `showOutput`, conditional blocks)
- [x] 3.2 Remove JSON output logic from uninstall handler (`outputPlanJsonV2`, `outputPartialPlanJson`, `showOutput`, conditional blocks)
- [x] 3.3 Run `pnpm typecheck` and fix any type errors

## 4. Remove Core Utilities

- [x] 4.1 Remove JSON types and conversion functions from `packages/core/src/experimental/workspace/plan.ts` (`PlanJson`, `PlanStepJson`, `SkillSourceJson`, `planToJson`, `sourceToJson`, `stepToJson`)
- [x] 4.2 Remove JSON exports from `packages/core/src/experimental/workspace/index.ts`
- [x] 4.3 Run `pnpm typecheck` and fix any type errors

## 5. Final Verification

- [x] 5.1 Run `pnpm lint` and fix any linting errors
- [x] 5.2 Run `pnpm test` and fix any test failures
- [x] 5.3 Run `pnpm test:e2e` and fix any E2E test failures
- [x] 5.4 Kill any remaining vitest worker processes
