import * as Effect from "effect/Effect";
import { runUninstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";

import { emitPlanResolutionResult } from "../../../json-output.js";
import {
  UninstallCommandCommandWorkflowActions,
  type UninstallCommandHandlerArgs,
} from "./command-actions.js";

export const handleUninstallCommand = (
  args: UninstallCommandHandlerArgs,
  flags: { yes: boolean; force: boolean; preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallCommandCommandWorkflowActions;
    const resolution = yield* runUninstallCommandWorkflow(args, actions, flags);
    yield* emitPlanResolutionResult("commands.uninstall", resolution);
  });
