## Context

The generic plan types in `workspace/plan.ts` use `action` as the field name on both `JobStep` (plan-time) and `OperationResult` (apply-time). The plan-time value `"execute"` was meant to express "we expect this step to succeed" — a prediction, not an instruction. The current naming obscures this intent and makes it harder to reason about what the field represents at each phase.

Beyond the field rename itself, several internal names (function names, variable names, test descriptions) assume the imperative "action" mental model. These should be updated to consistently reflect the prediction-vs-result model.

A deeper issue: the plan builder and the apply module currently construct _different_ messages for the same logical outcome. Display-plan shows `"commit (already installed)"` for a no-op, but apply-plan returns `"Skipped: commit"`. These should be unified — the expected result constructed at plan-build time should be the same result returned when a step is skipped at apply time.

## Goals / Non-Goals

**Goals:**

- Replace `JobStep.action: "execute" | "no-op" | "error"` with `JobStep = PlannedJobStep | JobStepResult` discriminated union
- `PlannedJobStep` carries `expectedResult: OperationResult`; `JobStepResult` adds `actualResult: OperationResult`
- Rename `OperationResult.action` → `OperationResult.result`
- Remove `JobStep.reason` (folded into `expectedResult.message`)
- Move `OperationResult` to `plan.ts` (now used in plan types)
- `applyPlan` returns `Plan<Op>` (not `ReadonlyArray<OperationResult>`) — promotes `PlannedJobStep` → `JobStepResult`
- `displayPlan` handles both step variants — unified display for pre-application previews and post-application results
- `resolvePlan` owns all display — calls `displayPlan` before and after `applyPlan`; command handlers never render plan output
- Unify skip messages: `applyStep` sets `actualResult = expectedResult` for non-success steps
- Update internal names (functions, variables, test descriptions) to reflect the prediction/result model
- Maintain identical runtime behavior

**Non-Goals:**

- Backward compatibility (no migration shim, no aliases)
- Adding new result values beyond `"success" | "no-op" | "error"`
- Refactoring beyond what's needed for naming consistency and unified display

## Decisions

### 1. `JobStep.expectedResult` is `OperationResult`, not a string union

Instead of `action: "execute" | "no-op" | "error"`, the step carries its full expected result including the message. This means the plan builder constructs the same `OperationResult` that would be returned at apply time for non-success steps.

`JobStep` becomes a discriminated union of two variants: `PlannedJobStep` (before execution — carries `expectedResult` only) and `JobStepResult` (after execution — carries both `expectedResult` and `actualResult`). This avoids an `Option<OperationResult>` for `actualResult` on unapplied plans and makes the plan's lifecycle phase explicit in the type system.

```typescript
// Before (plan.ts):
export interface JobStep<TOperation> {
  readonly operation: TOperation;
  readonly action: "execute" | "no-op" | "error";
  readonly reason: Option<string>;
  readonly label: string;
}

// After (plan.ts):
export interface PlannedJobStep<TOperation> {
  readonly _tag: "PlannedJobStep";
  readonly operation: TOperation;
  readonly expectedResult: OperationResult;
  readonly label: string;
}

export interface JobStepResult<TOperation> {
  readonly _tag: "JobStepResult";
  readonly operation: TOperation;
  readonly expectedResult: OperationResult;
  readonly actualResult: OperationResult;
  readonly label: string;
}

export type JobStep<TOperation> = PlannedJobStep<TOperation> | JobStepResult<TOperation>;
```

`reason` is removed — it's now part of `expectedResult.message`. The plan builder is responsible for constructing a human-readable message at build time. Plan builders produce `PlannedJobStep`; `applyPlan` promotes each to `JobStepResult` by adding `actualResult`.

### 2. `OperationResult` moves to `plan.ts`

Currently `OperationResult` is defined in `apply-plan.ts`, and `plan.ts` has no dependency on it. Now that `JobStep` references `OperationResult`, the type must move to `plan.ts` to avoid a circular dependency (`plan.ts` → `apply-plan.ts` → `plan.ts`). `apply-plan.ts` re-exports it for existing consumers.

```typescript
// Before: OperationResult in apply-plan.ts
// plan.ts has no imports from apply-plan.ts

// After: OperationResult in plan.ts
// apply-plan.ts imports and re-exports from plan.ts

// plan.ts:
export type OperationResult = {
  readonly result: "no-op" | "success" | "error";
  readonly message: string;
};

export type JobStep<TOperation> = PlannedJobStep<TOperation> | JobStepResult<TOperation>;

// apply-plan.ts:
export type { OperationResult, PlannedJobStep, JobStepResult, JobStep } from "./plan.js";
```

### 3. `applyStep` promotes `PlannedJobStep` to `JobStepResult`

When a step is not expected to succeed, the apply module promotes it to `JobStepResult` with `actualResult = expectedResult`. For success-expected steps, it dispatches to the handler and records the actual outcome.

```typescript
// Before:
const applyAction = <Op extends Operation<string, unknown>, T extends Handlers<Op>>(
  step: JobStep<Op>,
  handlers: T,
): Effect.Effect<OperationResult, never, ExecutionContext<T>> => {
  if (step.action !== "execute") {
    return Effect.succeed({ action: "no-op" as const, message: `Skipped: ${step.label}` });
  }
  const handler = handlers[step.operation.name as Op["name"]] as unknown as ...;
  return handler(step.operation).pipe(
    Effect.catchTag("OperationError", (error) =>
      Effect.succeed({ action: "error" as const, message: error.message }),
    ),
  );
};

// After:
const applyStep = <Op extends Operation<string, unknown>, T extends Handlers<Op>>(
  step: PlannedJobStep<Op>,
  handlers: T,
): Effect.Effect<JobStepResult<Op>, never, ExecutionContext<T>> => {
  const promote = (actualResult: OperationResult): JobStepResult<Op> => ({
    _tag: "JobStepResult",
    operation: step.operation,
    expectedResult: step.expectedResult,
    actualResult,
    label: step.label,
  });

  if (step.expectedResult.result !== "success") {
    return Effect.succeed(promote(step.expectedResult));
  }
  const handler = handlers[step.operation.name as Op["name"]] as unknown as ...;
  return handler(step.operation).pipe(
    Effect.map(promote),
    Effect.catchTag("OperationError", (error) =>
      Effect.succeed(promote({ result: "error" as const, message: error.message })),
    ),
  );
};
```

The dispatch condition changes from `step.action !== "execute"` to `step.expectedResult.result !== "success"`. The key difference: the skip path now returns the plan builder's message (e.g., `"already installed"`) instead of a generic `"Skipped: commit"`.

### 4. display-plan handles both `PlannedJobStep` and `JobStepResult`

`displayPlan` uses `step._tag` to determine which result to render. For `PlannedJobStep`, it reads `expectedResult`. For `JobStepResult`, it reads `actualResult`. This allows the same function to display both pre-application previews and post-application results (see `install-apply-skill` change for the full `resolvePlan` orchestration).

```typescript
// Before:
const allActions = plan.jobs.flatMap((job) => [...job.steps]);
const executeActions = allActions.filter((a): a is JobStep<Op> => a.action === "execute");
const noopActions = allActions.filter((a): a is JobStep<Op> => a.action === "no-op");

if (noopActions.length > 0) {
  for (const action of noopActions) {
    const reason = Option.getOrElse(action.reason, () => "skipped");
    yield * clack.log.warn(`  - ${action.label} (${reason})`);
  }
}

// After:
const allSteps = plan.jobs.flatMap((job) => [...job.steps]);

// Extract the relevant result based on step phase
const getResult = (step: JobStep<Op>): OperationResult =>
  step._tag === "JobStepResult" ? step.actualResult : step.expectedResult;

const isApplied = allSteps.length > 0 && allSteps[0]._tag === "JobStepResult";

const successSteps = allSteps.filter((s) => getResult(s).result === "success");
const noopSteps = allSteps.filter((s) => getResult(s).result === "no-op");

// Render with phase-appropriate indicators and summary
// PlannedJobStep: "+ label" (will do), "- label (msg)" (skipping), "N to install, M to skip"
// JobStepResult:  "✓ label" (did it), "- label (msg)" (skipped), "N installed, M skipped"
```

### 5. build-plan constructs full `OperationResult` at plan time

The plan builder constructs the expected result with both `result` and `message` fields. The message is what display-plan will show and what apply-plan will return if the step is skipped.

```typescript
// Before (build-plan.ts):
installed && !op.args.force
  ? {
      operation: op,
      action: "no-op" as const,
      reason: Option.some("already installed"),
      label: op.args.skill.name,
    }
  : {
      operation: op,
      action: "execute" as const,
      reason: Option.none(),
      label: op.args.skill.name,
    };

// After (produces PlannedJobStep):
installed && !op.args.force
  ? {
      _tag: "PlannedJobStep" as const,
      operation: op,
      expectedResult: { result: "no-op" as const, message: "already installed" },
      label: op.args.skill.name,
    }
  : {
      _tag: "PlannedJobStep" as const,
      operation: op,
      expectedResult: { result: "success" as const, message: `Installed ${op.args.skill.name}` },
      label: op.args.skill.name,
    };
```

### 6. `resolvePlan` owns all display, `applyPlan` returns `Plan<Op>`

`resolvePlan` calls `displayPlan` before and after `applyPlan`. Command handlers receive the applied plan for inspection (e.g., exit codes) but never render results.

`applyPlan` returns `Plan<Op>` with all steps promoted to `JobStepResult`, not `ReadonlyArray<OperationResult>`.

```typescript
// Before (service.ts resolvePlan):
yield * displayPlan(plan);
return yield * applyPlan(plan, handlers); // returns ReadonlyArray<OperationResult>

// Before (handler.ts — handler displays results):
const results = yield * ws.resolvePlan(plan, { "install-skill": installSkill });
for (const result of results) {
  if (result.action === "success") yield * clack.log.success(result.message);
  else if (result.action === "error") yield * clack.log.error(result.message);
}
yield * clack.outro("Done");

// After (service.ts resolvePlan — owns all display):
resolvePlan: (plan, handlers) =>
  Effect.gen(function* () {
    const clack = yield* Clack;

    if (options.preview) {
      yield* displayPlan(plan); // pre: shows expectedResult

      if (options.yes) {
        const applied = yield* applyPlan(plan, handlers);
        yield* displayPlan(applied); // post: shows actualResult
        return applied;
      } else if (resolvedNonInteractive) {
        yield* clack.log.warn(
          "Cannot prompt in non-interactive mode. Use --yes to apply, or remove --preview.",
        );
        return plan; // return unapplied plan
      } else {
        const confirmed = yield* clack.confirm("Apply changes?");
        if (!confirmed) {
          yield* clack.outro("Cancelled.");
          return plan;
        }
        const applied = yield* applyPlan(plan, handlers);
        yield* displayPlan(applied);
        return applied;
      }
    } else {
      yield* displayPlan(plan);
      const applied = yield* applyPlan(plan, handlers);
      yield* displayPlan(applied);
      return applied;
    }
  });

// After (handler.ts — no display logic):
const result = yield * ws.resolvePlan(plan, { "install-skill": installSkill });
yield * clack.outro("Done");
```

**Signature changes:**

```typescript
// applyPlan — returns Plan<Op> instead of ReadonlyArray<OperationResult>
export const applyPlan = <Op extends Operation<string, unknown>, T extends Handlers<Op>>(
  plan: Plan<Op>,
  handlers: T,
): Effect.Effect<Plan<Op>, never, ExecutionContext<T>> => ...

// resolvePlan — returns Plan<Op> instead of ReadonlyArray<OperationResult>
resolvePlan: <Op extends Operation<string, unknown>, T extends Handlers<Op>>(
  plan: Plan<Op>,
  handlers: T,
) => Effect<Plan<Op>, PromptCancelled | PromptError, Clack | ExecutionContext<T>>;
```

### 7. OperationResult in executor returns

Executors like `installSkill` construct `OperationResult` literals. The field rename is mechanical.

```typescript
// Before (install-skill.ts):
return {
  action: "error",
  message: `Failed to install ${op.args.skill.name} for some agents: ${failedAgents.join(", ")}`,
} satisfies OperationResult;

return {
  action: "success",
  message: `Installed ${op.args.skill.name}`,
} satisfies OperationResult;

// After:
return {
  result: "error",
  message: `Failed to install ${op.args.skill.name} for some agents: ${failedAgents.join(", ")}`,
} satisfies OperationResult;

return {
  result: "success",
  message: `Installed ${op.args.skill.name}`,
} satisfies OperationResult;
```

### 8. Test descriptions should reflect the prediction model

Test names currently use imperative language. They should describe the prediction/result model.

```typescript
// Before (apply-plan.test.ts):
"dispatches execute actions to handler by name";
"skips no-op actions";
"returns no-op results when all actions are no-op";

// After:
"dispatches steps expected to succeed to handler by name";
"skips steps with no-op expected result";
"returns no-op results when all steps expect no-op";

// Before (build-plan.test.ts):
"marks new skills as execute";
"marks already-installed skills as no-op";
"marks already-installed skills as execute when force is true";
"handles mixed execute and no-op actions";

// After:
"marks new skills as expected success";
"marks already-installed skills as expected no-op";
"marks already-installed skills as expected success when force is true";
"handles mixed success and no-op expected results";
```

### 9. Doc comments and JSDoc

Update doc comments that reference `action`, `"execute"`, or the old field names:

- `apply-plan.ts` module comment: "dispatching each 'execute' step" → "dispatching each step expected to succeed"
- `applyPlan` JSDoc: "Only processes `\"execute\"` actions" → "Only dispatches steps with `expectedResult.result === \"success\"`"
- `display-plan.ts` JSDoc: references to `step.operation` are already correct; no action references in JSDoc

## Risks / Trade-offs

- [Mechanical rename across many files] → Low risk; all usages are statically typed so the compiler catches missed references. Run `pnpm typecheck` after changes.
- [Spec drift] → Specs reference `action` and `"execute"` extensively. Delta specs must update all affected scenarios. Verify with `openspec status` after archiving.
- [`result.result` repetition] → The double `.result` in handler code (`result.result === "success"`) is slightly awkward but unambiguous. Alternative `outcome` was considered but `result` is more natural for "what happened." This is acceptable.
- [Plan builder must construct meaningful messages] → Previously, `reason` was optional (`Option<string>`) and the message could be absent. Now the plan builder must always provide a message for every expected result, including success steps. This is more work upfront but ensures consistent display.
