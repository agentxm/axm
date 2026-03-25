/**
 * Shared install command workflow orchestration.
 *
 * Defines the `InstallExtensionCommandWorkflowActions` interface and
 * `runInstallCommandWorkflow` function shared by all install command handlers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type { AppError } from "@axm.sh/core/unstable/app-error";
import type { PromptCancelled } from "@axm.sh/core/unstable/prompt-cancelled";
import type { Plan } from "../../workspace/plan.js";
import { Workspace } from "../../workspace/service.js";

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
  readonly discoverRefs: (reqs: ReadonlyArray<Req>) => Effect.Effect<ReadonlyArray<Ref>, AppError>;
  readonly finalizeIntent: (
    parsed: Parsed,
    refs: ReadonlyArray<Ref>,
  ) => Effect.Effect<Intent, AppError>;
  readonly buildPlan: (intent: Intent) => Effect.Effect<Plan, AppError>;
}

// -----------------------------------------------------------------------------
// Install Command Workflow
// -----------------------------------------------------------------------------

/**
 * Run the canonical install command workflow.
 *
 * Executes phases in order: parse -> resolveSource -> discover ->
 * finalizeIntent -> buildPlan -> resolvePlan.
 */
export const runInstallCommandWorkflow = <Args, Parsed, Req, Ref, Intent>(
  args: Args,
  actions: InstallExtensionCommandWorkflowActions<Args, Parsed, Req, Ref, Intent>,
) =>
  Effect.gen(function* () {
    const parsed = yield* actions.parseArgs(args);
    const sourceRequests = yield* actions.resolveSourceRequests(parsed);
    const refs = yield* actions.discoverRefs(sourceRequests);
    const intent = yield* actions.finalizeIntent(parsed, refs);
    const plan = yield* actions.buildPlan(intent);
    const ws = yield* Workspace;
    yield* ws.resolvePlan(plan);
  });
