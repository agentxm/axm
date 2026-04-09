import * as Effect from "effect/Effect";
import { runInstallCommandWorkflow } from "@axm.sh/core/unstable/workflows";

import { emitPlanResolutionResult } from "../../../json-output.js";
import {
  InstallCommandCommandWorkflowActions,
  type InstallCommandHandlerArgs,
} from "./command-actions.js";

export const handleInstallCommand = Effect.fn("InstallCommand.handle")(function* (
  args: InstallCommandHandlerArgs,
) {
  const actions = yield* InstallCommandCommandWorkflowActions;
  const resolution = yield* runInstallCommandWorkflow(args, actions, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("commands.install", resolution);
});
