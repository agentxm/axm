## 1. Plan types and OperationResult relocation

- [x] 1.1 Update tests for `plan.ts`: add tests for `PlannedJobStep`, `JobStepResult`, and `JobStep` union; update existing `JobStep` tests to use new shape
- [x] 1.2 Refactor `plan.ts`: replace `JobStep` interface with `PlannedJobStep`, `JobStepResult`, and `JobStep<Op>` discriminated union; remove `action` and `reason` fields
- [x] 1.3 Move `OperationResult` from `apply-plan.ts` to `plan.ts`; rename `action` field to `result`; re-export from `apply-plan.ts`
- [x] 1.4 Update `workspace/index.ts` to export `PlannedJobStep`, `JobStepResult` alongside `JobStep`
- [x] 1.5 Run `pnpm typecheck` — expect failures in downstream consumers; verify only expected errors
- [x] 1.6 Run `pnpm lint` — fix any issues
- [x] 1.7 Run `pnpm test` — fix any failures
- [x] 1.8 Run `pnpm test:e2e` — fix any failures
- [x] 1.9 Kill any vitest worker processes

## 2. Apply-plan refactor

- [x] 2.1 Update tests for `apply-plan.ts`: rename test descriptions to prediction model; update step fixtures to `PlannedJobStep` shape; assert `applyPlan` returns `Plan<Op>` with `JobStepResult` steps
- [x] 2.2 Rename `applyAction` to `applyStep`; update to accept `PlannedJobStep<Op>` and return `JobStepResult<Op>`; dispatch on `step.expectedResult.result !== "success"` instead of `step.action !== "execute"`; promote step with `actualResult`
- [x] 2.3 Update `applyPlan` to return `Plan<Op>` (with `JobStepResult` steps) instead of `ReadonlyArray<OperationResult>`; reconstruct plan with promoted steps preserving name, description, and job structure
- [x] 2.4 Run `pnpm typecheck` — fix any issues
- [x] 2.5 Run `pnpm lint` — fix any issues
- [x] 2.6 Run `pnpm test` — fix any failures
- [x] 2.7 Run `pnpm test:e2e` — fix any failures
- [x] 2.8 Kill any vitest worker processes

## 3. Display-plan refactor

- [x] 3.1 Update tests for `display-plan.ts`: add tests for both `PlannedJobStep` and `JobStepResult` rendering; update existing tests to use new step shapes
- [x] 3.2 Refactor `displayPlan` to handle both step variants via `_tag` discriminant; use `expectedResult` for `PlannedJobStep`, `actualResult` for `JobStepResult`; show phase-appropriate indicators and summary tense
- [x] 3.3 Run `pnpm typecheck` — fix any issues
- [x] 3.4 Run `pnpm lint` — fix any issues
- [x] 3.5 Run `pnpm test` — fix any failures
- [x] 3.6 Run `pnpm test:e2e` — fix any failures
- [x] 3.7 Kill any vitest worker processes

## 4. Build-plan refactor

- [x] 4.1 Update tests for `build-plan.ts`: rename test descriptions to prediction model; assert steps are `PlannedJobStep` with full `expectedResult: OperationResult`
- [x] 4.2 Refactor `buildPlan` to produce `PlannedJobStep` with `_tag: "PlannedJobStep"` and `expectedResult: OperationResult` (including human-readable `message`); remove `action` and `reason` fields
- [x] 4.3 Run `pnpm typecheck` — fix any issues
- [x] 4.4 Run `pnpm lint` — fix any issues
- [x] 4.5 Run `pnpm test` — fix any failures
- [x] 4.6 Run `pnpm test:e2e` — fix any failures
- [x] 4.7 Kill any vitest worker processes

## 5. resolvePlan and service refactor

- [x] 5.1 Update tests for `service.ts` resolvePlan: assert it calls `displayPlan` before and after `applyPlan`; assert it returns `Plan<Op>`; update step fixtures to new shapes
- [x] 5.2 Refactor `resolvePlan` to own all display (call `displayPlan` before and after `applyPlan`); update return type to `Plan<Op>`; update `WorkspaceContextService` interface signature
- [x] 5.3 Run `pnpm typecheck` — fix any issues
- [x] 5.4 Run `pnpm lint` — fix any issues
- [x] 5.5 Run `pnpm test` — fix any failures
- [x] 5.6 Run `pnpm test:e2e` — fix any failures
- [x] 5.7 Kill any vitest worker processes

## 6. Install handler and executor updates

- [x] 6.1 Update tests for `install-skill.ts`: rename `action` to `result` in `OperationResult` assertions
- [x] 6.2 Refactor `installSkill` executor: rename `action` field to `result` in returned `OperationResult` literals
- [x] 6.3 Update tests for `handler.ts`: remove result display assertions; assert handler delegates display to `resolvePlan`
- [x] 6.4 Refactor install handler: remove inline result display logic; rely on `resolvePlan` for all display
- [x] 6.5 Run `pnpm typecheck` — fix any issues
- [x] 6.6 Run `pnpm lint` — fix any issues
- [x] 6.7 Run `pnpm test` — fix any failures
- [x] 6.8 Run `pnpm test:e2e` — fix any failures
- [x] 6.9 Kill any vitest worker processes

## 7. Uninstall handler and doc comments

- [x] 7.1 Update uninstall handler if it references old types (stub handler — verify no `action` references)
- [x] 7.2 Update doc comments and JSDoc in `apply-plan.ts`, `display-plan.ts`, and `plan.ts` to reflect prediction/result model
- [x] 7.3 Run `pnpm typecheck` — fix any issues
- [x] 7.4 Run `pnpm lint` — fix any issues
- [x] 7.5 Run `pnpm test` — fix any failures
- [x] 7.6 Run `pnpm test:e2e` — fix any failures
- [x] 7.7 Kill any vitest worker processes
