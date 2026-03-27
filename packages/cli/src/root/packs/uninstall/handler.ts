/**
 * Uninstall command handler - Effect-based orchestration for `axm packs uninstall`.
 *
 * Delegates to shared uninstall command workflow via UninstallPackCommandWorkflowActions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { runUninstallCommandWorkflow } from "@axm.sh/core/unstable/workflows";
import {
  UninstallPackCommandWorkflowActions,
  type UninstallPackHandlerArgs,
} from "./command-actions.js";

/**
 * Handles the `axm packs uninstall` command.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleUninstallPack = (
  args: UninstallPackHandlerArgs,
  flags: { yes: boolean; force: boolean; preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallPackCommandWorkflowActions;
    yield* runUninstallCommandWorkflow(args, actions, flags);
  });
