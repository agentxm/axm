/**
 * Install command handler - Effect-based orchestration for `axm commands install`.
 *
 * Delegates to shared install command workflow via InstallCommandCommandWorkflowActions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { TelemetryClient } from "../../../telemetry/index.js";
import { runInstallCommandWorkflow } from "../../../workflows/install-command/workflow.js";
import {
  InstallCommandCommandWorkflowActions,
  type InstallCommandHandlerArgs,
} from "./command-actions.js";

export type { InstallCommandHandlerArgs } from "./command-actions.js";

/**
 * Handles the `axm commands install` command.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleInstallCommand = (args: InstallCommandHandlerArgs) =>
  Effect.gen(function* () {
    const tc = yield* TelemetryClient;
    yield* tc.trackEvent("command_invoked", { command: "commands install" });
    const actions = yield* InstallCommandCommandWorkflowActions;
    yield* runInstallCommandWorkflow(args, actions);
  });
