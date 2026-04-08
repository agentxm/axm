/**
 * Install command handler - Effect-based orchestration for `axm subagents install`.
 *
 * Delegates to the shared install command workflow via
 * `InstallSubagentCommandWorkflowActions`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { runInstallCommandWorkflow } from "@axm.sh/core/unstable/workflows";

import { emitPlanResolutionResult } from "../../../json-output.js";
import { InstallSubagentCommandWorkflowActions } from "./command-actions.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the install command.
 */
export interface InstallSubagentHandlerArgs {
  /** Source to install subagents from */
  readonly source: string;
  /** Specific subagent(s) to install (by name) */
  readonly subagents: readonly string[];
  /** Install all available subagents */
  readonly all: boolean;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm subagents install` command.
 *
 * Resolves `InstallSubagentCommandWorkflowActions` and delegates to
 * `runInstallCommandWorkflow` for canonical phase execution.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleInstall = (
  args: InstallSubagentHandlerArgs,
  flags: { yes: boolean; force: boolean; preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* InstallSubagentCommandWorkflowActions;
    const resolution = yield* runInstallCommandWorkflow(args, actions, flags);
    yield* emitPlanResolutionResult("subagents.install", resolution);
  });
