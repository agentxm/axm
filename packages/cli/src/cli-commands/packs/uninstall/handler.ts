/**
 * Uninstall command handler - Effect-based orchestration for `axm packs uninstall`.
 *
 * Delegates to shared uninstall command workflow via UninstallPackCommandWorkflowActions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { TelemetryClient } from "../../../telemetry/index.js";
import { runUninstallCommandWorkflow } from "../../../workflows/uninstall-command/workflow.js";
import {
  UninstallPackCommandWorkflowActions,
  type UninstallPackHandlerArgs,
} from "./command-actions.js";

// Re-export types for backwards compatibility
export type { UninstallPackHandlerArgs } from "./command-actions.js";

/**
 * Handles the `axm packs uninstall` command.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleUninstallPack = (args: UninstallPackHandlerArgs) =>
  Effect.gen(function* () {
    const tc = yield* TelemetryClient;
    yield* tc.trackEvent("command_invoked", { command: "packs uninstall" });
    const actions = yield* UninstallPackCommandWorkflowActions;
    yield* runUninstallCommandWorkflow(args, actions);
  });
