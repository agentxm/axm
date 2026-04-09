import * as Effect from "effect/Effect";
import { runInstallCommandWorkflow } from "@axm.sh/core/unstable/workflows";

import { emitPlanResolutionResult } from "../../../json-output.js";
import {
  InstallMcpServerCommandWorkflowActions,
  type InstallMcpServerHandlerArgs,
} from "./command-actions.js";

export const handleInstallMcpServer = (
  args: InstallMcpServerHandlerArgs,
  flags: { yes: boolean; force: boolean; preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* InstallMcpServerCommandWorkflowActions;
    const resolution = yield* runInstallCommandWorkflow(args, actions, flags);
    yield* emitPlanResolutionResult("mcp-servers.install", resolution);
  });
