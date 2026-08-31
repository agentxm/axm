/**
 * Shared install command workflow orchestration.
 *
 * Defines the `InstallExtensionCommandWorkflowActions` interface and
 * `runInstallCommandWorkflow` function shared by all install command handlers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import type { AppError } from "../../app-error/index.js";
import { CliRenderer } from "../../cli-renderer/index.js";
import type { PromptCancelled } from "../../cli-prompt/prompt-cancelled.js";
import type { Plan } from "../../plan/plan.js";
import type { OperationResolution } from "../../plan/operation-resolution.js";
import { previewOrApplyPlan } from "../../plan/resolve-plan.js";
import type { PlanExecution } from "../../plan/plan-execution.js";

// -----------------------------------------------------------------------------
// Install Command Workflow Actions Interface
// -----------------------------------------------------------------------------

/**
 * Type-specific actions for install command workflows.
 *
 * Each extension type provides its own implementation of these actions.
 * The generic type parameters allow full type safety per extension type.
 *
 * @typeParam Args - Raw command arguments from the active CLI parser
 * @typeParam Parsed - Parsed/validated arguments
 * @typeParam Req - Source request type (for resolution)
 * @typeParam Ref - Extension ref type (discovery output)
 * @typeParam Intent - Command-specific install intent
 */
export interface InstallExtensionCommandWorkflowActions<Args, Parsed, Req, Ref, Intent> {
  readonly parseArgs: (args: Args) => Effect.Effect<Parsed, AppError>;
  readonly resolveSourceRequests: (
    parsed: Parsed,
  ) => Effect.Effect<ReadonlyArray<Req>, AppError | PromptCancelled>;
  readonly discoverRefs: (
    reqs: ReadonlyArray<Req>,
  ) => Effect.Effect<ReadonlyArray<Ref>, AppError, Scope.Scope>;
  readonly finalizeIntent: (
    parsed: Parsed,
    refs: ReadonlyArray<Ref>,
  ) => Effect.Effect<Intent, AppError | PromptCancelled>;
  readonly buildPlan: (intent: Intent) => Effect.Effect<Plan, AppError>;
}

// -----------------------------------------------------------------------------
// Install Command Workflow
// -----------------------------------------------------------------------------

/**
 * Run the canonical install command workflow.
 *
 * Executes phases in order: parse -> resolveSource -> discover ->
 * finalizeIntent -> buildPlan -> previewOrApplyPlan.
 */
export const buildInstallCommandPlan = <
  Args,
  Parsed,
  Req,
  Ref,
  Intent,
  TransformRequirements = never,
>(
  args: Args,
  actions: InstallExtensionCommandWorkflowActions<Args, Parsed, Req, Ref, Intent>,
  options?: {
    readonly transformIntent?: (intent: Intent) => Intent;
    readonly transformPlan?: (plan: Plan) => Effect.Effect<Plan, AppError, TransformRequirements>;
  },
) =>
  Effect.gen(function* () {
    const parsed = yield* actions.parseArgs(args);
    const sourceRequests = yield* actions.resolveSourceRequests(parsed);
    const refs = yield* actions.discoverRefs(sourceRequests);
    const finalizedIntent = yield* actions.finalizeIntent(parsed, refs);
    const intent = options?.transformIntent?.(finalizedIntent) ?? finalizedIntent;
    const plan = yield* actions.buildPlan(intent);
    return options?.transformPlan === undefined ? plan : yield* options.transformPlan(plan);
  });

/**
 * Run the canonical install command workflow.
 *
 * Executes phases in order: parse -> resolveSource -> discover ->
 * finalizeIntent -> buildPlan -> previewOrApplyPlan.
 */
export const runInstallCommandWorkflow = <
  Args,
  Parsed,
  Req,
  Ref,
  Intent,
  TransformRequirements = never,
>(
  args: Args,
  actions: InstallExtensionCommandWorkflowActions<Args, Parsed, Req, Ref, Intent>,
  options: {
    readonly execution: PlanExecution;
    readonly transformIntent?: (intent: Intent) => Intent;
    readonly transformPlan?: (plan: Plan) => Effect.Effect<Plan, AppError, TransformRequirements>;
  },
) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const plan = yield* renderer.withSpinner(
      "Resolving extension sources",
      () => buildInstallCommandPlan(args, actions, options),
      { successMessage: "Resolved extension sources" },
    );
    return yield* previewOrApplyPlan(plan, { execution: options.execution });
  }).pipe(
    Effect.scoped,
    Effect.map((resolution): OperationResolution => resolution),
  );
