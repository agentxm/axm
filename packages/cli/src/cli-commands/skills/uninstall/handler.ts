/**
 * Uninstall command handler - Effect-based orchestration for `axm skills uninstall`.
 *
 * Delegates to the shared uninstall command workflow via
 * `UninstallSkillCommandWorkflowActions`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { runUninstallCommandWorkflow } from "../../../workflows/uninstall-command/workflow.js";
import {
  UninstallSkillCommandWorkflowActions,
  type UninstallHandlerArgs,
} from "./command-actions.js";

// Re-export the type so existing imports keep working
export type { UninstallHandlerArgs } from "./command-actions.js";

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm skills uninstall` command.
 *
 * Resolves `UninstallSkillCommandWorkflowActions` and delegates to
 * `runUninstallCommandWorkflow` for canonical phase execution.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleUninstall = (args: UninstallHandlerArgs) =>
  Effect.gen(function* () {
    const actions = yield* UninstallSkillCommandWorkflowActions;
    yield* runUninstallCommandWorkflow(args, actions);
  });
