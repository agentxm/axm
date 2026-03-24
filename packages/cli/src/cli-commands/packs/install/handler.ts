/**
 * Install command handler - Effect-based orchestration for `axm packs install`.
 *
 * Delegates to shared install command workflow via InstallPackCommandWorkflowActions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { runInstallCommandWorkflow } from "../../../workflows/install-command/workflow.js";
import {
  InstallPackCommandWorkflowActions,
  type InstallPackHandlerArgs,
} from "./command-actions.js";

// Re-export types for backwards compatibility
export type { InstallPackHandlerArgs } from "./command-actions.js";

/**
 * Handles the `axm packs install` command.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleInstallPack = (args: InstallPackHandlerArgs) =>
  Effect.gen(function* () {
    const actions = yield* InstallPackCommandWorkflowActions;
    yield* runInstallCommandWorkflow(args, actions);
  });
