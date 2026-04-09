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
import type { Plan, PlanResolution } from "../../workspace/plan.js";
import { previewOrApplyPlan } from "../../workspace/resolve-plan.js";

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
  readonly buildUninstallPlan: (intent: Intent) => Effect.Effect<Plan, AppError>;
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
  flags: { yes: boolean; force: boolean; preview: boolean },
) =>
  Effect.gen(function* () {
    const parsed = yield* actions.parseArgs(args);
    const intent = yield* actions.finalizeIntent(parsed);
    const plan = yield* actions.buildUninstallPlan(intent);
    return yield* previewOrApplyPlan(plan, flags);
  }).pipe(Effect.map((resolution): PlanResolution => resolution));
