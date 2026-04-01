/**
 * Install command handler - Effect-based orchestration for `axm commands install`.
 *
 * Delegates to shared install command workflow via InstallCommandCommandWorkflowActions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { runInstallCommandWorkflow } from "@axm.sh/core/unstable/workflows";

import { emitPlanResolutionResult } from "../../../json-output.js";
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
export const handleInstallCommand = (
  args: InstallCommandHandlerArgs,
  flags: { yes: boolean; force: boolean; preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* InstallCommandCommandWorkflowActions;
    const resolution = yield* runInstallCommandWorkflow(args, actions, flags);
    yield* emitPlanResolutionResult("commands.install", resolution);
  });
