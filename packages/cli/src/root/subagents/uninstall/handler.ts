import * as Effect from "effect/Effect";
import { runUninstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";

import { emitPlanResolutionResult } from "../../../json-output.js";
import {
  UninstallSubagentCommandWorkflowActions,
  type UninstallSubagentHandlerArgs,
} from "./command-actions.js";

export const handleUninstall = (
  args: UninstallSubagentHandlerArgs,
  flags: { yes: boolean; force: boolean; preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallSubagentCommandWorkflowActions;
    const resolution = yield* runUninstallCommandWorkflow(args, actions, flags);
    yield* emitPlanResolutionResult("subagents.uninstall", resolution);
  });
