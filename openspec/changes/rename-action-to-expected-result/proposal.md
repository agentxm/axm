## Why

The `action` field on `JobStep` and `OperationResult` conflates naming across two distinct concepts. In the plan phase, `JobStep.action: "execute" | "no-op" | "error"` was intended to describe the **expected outcome** of a step — what the planner predicts will happen. In the apply phase, `OperationResult.action` describes the **actual outcome**. The name "action" suggests an imperative instruction rather than a predicted or observed result.

## What Changes

- **BREAKING** `JobStep` becomes a discriminated union: `PlannedJobStep` (carries `expectedResult`) | `JobStepResult` (adds `actualResult`). Replaces the single interface with `action` field.
- **BREAKING** `OperationResult.action` renamed to `OperationResult.result` with values `"no-op" | "success" | "error"` (unchanged values)
- **BREAKING** `applyPlan` returns `Plan<Op>` (with `JobStepResult` steps) instead of `ReadonlyArray<OperationResult>`
- **BREAKING** `resolvePlan` returns `Plan<Op>` and owns all display — command handlers no longer render results
- `displayPlan` handles both step variants via `_tag` discriminant — unified pre/post display
- All consumers of these fields updated: plan builders, display-plan, apply-plan, resolvePlan, handler result reporting

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `workspace-plan`: `JobStep` becomes `PlannedJobStep | JobStepResult` union; `OperationResult.action` → `.result`; `applyPlan` returns `Plan<Op>`
- `plan-confirm-apply`: `resolvePlan` owns all display (calls `displayPlan` before and after `applyPlan`); returns `Plan<Op>` instead of `ReadonlyArray<OperationResult>`; command handlers no longer render results
- `skills-install-build-plan`: Plan builder produces `PlannedJobStep` with `expectedResult` instead of `action`; value `"execute"` → `"success"`, value `"no-op"` unchanged

## Impact

- `packages/cli/src/workspace/plan.ts` — type definitions (`PlannedJobStep`, `JobStepResult`, `JobStep` union, `OperationResult`)
- `packages/cli/src/workspace/apply-plan.ts` — `applyStep` promotes to `JobStepResult`; `applyPlan` returns `Plan<Op>`
- `packages/cli/src/workspace/display-plan.ts` — handles both step variants via `_tag`
- `packages/cli/src/workspace/service.ts` — `resolvePlan` owns all display, returns `Plan<Op>`
- `packages/cli/src/cli-commands/skills/install/build-plan.ts` — plan construction (produces `PlannedJobStep`)
- `packages/cli/src/cli-commands/skills/install/install-skill.ts` — returns `OperationResult`
- `packages/cli/src/cli-commands/skills/install/handler.ts` — removes result display logic
- All associated test files
- Three specs: `workspace-plan`, `skills-install-build-plan`, `plan-confirm-apply`
