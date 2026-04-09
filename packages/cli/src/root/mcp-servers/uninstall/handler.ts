import * as Effect from "effect/Effect";
import { runUninstallCommandWorkflow } from "@axm.sh/core/unstable/workflows";

import { emitPlanResolutionResult } from "../../../json-output.js";
import {
  UninstallMcpServerCommandWorkflowActions,
  type UninstallMcpServerHandlerArgs,
} from "./command-actions.js";

export const handleUninstallMcpServer = (
  args: UninstallMcpServerHandlerArgs,
  flags: { yes: boolean; force: boolean; preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallMcpServerCommandWorkflowActions;
    const resolution = yield* runUninstallCommandWorkflow(args, actions, flags);
    yield* emitPlanResolutionResult("mcp-servers.uninstall", resolution);
  });
