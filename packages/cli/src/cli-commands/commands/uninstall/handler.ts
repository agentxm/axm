/**
 * Uninstall command handler - Effect-based orchestration for `axm commands uninstall`.
 *
 * Delegates to shared uninstall command workflow via UninstallCommandCommandWorkflowActions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { runUninstallCommandWorkflow } from "../../../workflows/uninstall-command/workflow.js";
import {
  UninstallCommandCommandWorkflowActions,
  type UninstallCommandHandlerArgs,
} from "./command-actions.js";

export type { UninstallCommandHandlerArgs } from "./command-actions.js";

/**
 * Handles the `axm commands uninstall` command.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleUninstallCommand = (args: UninstallCommandHandlerArgs) =>
  Effect.gen(function* () {
    const actions = yield* UninstallCommandCommandWorkflowActions;
    yield* runUninstallCommandWorkflow(args, actions);
  });
