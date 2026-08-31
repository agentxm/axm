/**
 * Shared uninstall command workflow orchestration.
 *
 * Defines the `UninstallExtensionCommandWorkflowActions` interface and
 * `runUninstallCommandWorkflow` function shared by all uninstall command handlers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type { AppError } from "../../app-error/index.js";
import type { Plan } from "../../plan/plan.js";
import type { OperationResolution } from "../../plan/operation-resolution.js";
import { previewOrApplyPlan } from "../../plan/resolve-plan.js";
import type { PlanExecution } from "../../plan/plan-execution.js";

// -----------------------------------------------------------------------------
// Uninstall Command Workflow Actions Interface
// -----------------------------------------------------------------------------

/**
 * Type-specific actions for uninstall command workflows.
 *
 * Each extension type provides its own implementation of these actions.
 * The generic type parameters allow full type safety per extension type.
 *
 * @typeParam Args - Raw command arguments from the active CLI parser
 * @typeParam Parsed - Parsed/validated arguments
 * @typeParam Intent - Command-specific uninstall intent
 */
export interface UninstallExtensionCommandWorkflowActions<Args, Parsed, Intent> {
  readonly parseArgs: (args: Args) => Effect.Effect<Parsed, AppError>;
  readonly finalizeIntent: (parsed: Parsed) => Effect.Effect<Intent, AppError>;
  readonly buildUninstallPlan: (
    intent: Intent,
    flags: UninstallWorkflowFlags,
  ) => Effect.Effect<Plan, AppError>;
}

export interface UninstallWorkflowFlags {
  readonly execution: PlanExecution;
  /** Optional delayed gate; candidate freshness is checked again after it completes. */
  readonly beforeApply?: () => Effect.Effect<void, AppError>;
}

// -----------------------------------------------------------------------------
// Uninstall Command Workflow
// -----------------------------------------------------------------------------

/**
 * Run the canonical uninstall command workflow.
 *
 * Executes phases in order: parse -> finalizeIntent -> buildUninstallPlan ->
 * previewOrApplyPlan.
 */
export const runUninstallCommandWorkflow = <Args, Parsed, Intent>(
  args: Args,
  actions: UninstallExtensionCommandWorkflowActions<Args, Parsed, Intent>,
  flags: UninstallWorkflowFlags,
) =>
  Effect.gen(function* () {
    const parsed = yield* actions.parseArgs(args);
    const intent = yield* actions.finalizeIntent(parsed);
    const plan = yield* actions.buildUninstallPlan(intent, flags);
    return yield* previewOrApplyPlan(plan, {
      execution: flags.execution,
      ...(flags.beforeApply === undefined ? {} : { beforeApply: flags.beforeApply }),
    });
  }).pipe(Effect.map((resolution): OperationResolution => resolution));
