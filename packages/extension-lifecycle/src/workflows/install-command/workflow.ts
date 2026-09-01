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
import type { Plan } from "@agentxm/workspace-operations";
import type { OperationResolution } from "@agentxm/workspace-operations";
import { previewOrApplyPlan } from "@agentxm/workspace-operations";
import type { PlanExecution } from "@agentxm/workspace-operations";
import { LifecycleResolutionProgress } from "../../resolution-progress.js";

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
 * @typeParam ParseError - Failures the argument/plan phases surface
 * @typeParam ResolveError - Failures the interactive resolution phases surface
 */
export interface InstallExtensionCommandWorkflowActions<
  Args,
  Parsed,
  Req,
  Ref,
  Intent,
  ParseError,
  ResolveError = ParseError,
> {
  readonly parseArgs: (args: Args) => Effect.Effect<Parsed, ParseError>;
  readonly resolveSourceRequests: (
    parsed: Parsed,
  ) => Effect.Effect<ReadonlyArray<Req>, ResolveError>;
  readonly discoverRefs: (
    reqs: ReadonlyArray<Req>,
  ) => Effect.Effect<ReadonlyArray<Ref>, ParseError, Scope.Scope>;
  readonly finalizeIntent: (
    parsed: Parsed,
    refs: ReadonlyArray<Ref>,
  ) => Effect.Effect<Intent, ResolveError>;
  readonly buildPlan: (intent: Intent) => Effect.Effect<Plan, ParseError>;
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
  ParseError,
  ResolveError,
  TransformError = never,
  TransformRequirements = never,
>(
  args: Args,
  actions: InstallExtensionCommandWorkflowActions<
    Args,
    Parsed,
    Req,
    Ref,
    Intent,
    ParseError,
    ResolveError
  >,
  options?: {
    readonly transformIntent?: (intent: Intent) => Intent;
    readonly transformPlan?: (
      plan: Plan,
    ) => Effect.Effect<Plan, TransformError, TransformRequirements>;
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
  ParseError,
  ResolveError,
  TransformError = never,
  TransformRequirements = never,
>(
  args: Args,
  actions: InstallExtensionCommandWorkflowActions<
    Args,
    Parsed,
    Req,
    Ref,
    Intent,
    ParseError,
    ResolveError
  >,
  options: {
    readonly execution: PlanExecution;
    readonly transformIntent?: (intent: Intent) => Intent;
    readonly transformPlan?: (
      plan: Plan,
    ) => Effect.Effect<Plan, TransformError, TransformRequirements>;
  },
) =>
  Effect.gen(function* () {
    const progress = yield* LifecycleResolutionProgress;
    const plan = yield* progress.withSourceResolution(
      buildInstallCommandPlan(args, actions, options),
    );
    return yield* previewOrApplyPlan(plan, { execution: options.execution });
  }).pipe(
    Effect.scoped,
    Effect.map((resolution): OperationResolution => resolution),
  );
