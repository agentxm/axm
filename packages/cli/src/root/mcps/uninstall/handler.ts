import * as Effect from "effect/Effect";
import { runUninstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";

import { emitAppliedPlanOutcome } from "../../shared/applied-plan-output.js";
import { makeUninstallPlanExecutionMode } from "../../shared/confirmation-recovery.js";
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
    const execution = yield* makeUninstallPlanExecutionMode(
      flags,
      ["mcps", "uninstall"],
      [args.serverName],
    );
    const resolution = yield* runUninstallCommandWorkflow(args, actions, {
      execution,
      displayApplied: false,
    });
    yield* emitAppliedPlanOutcome({
      command: "mcps.uninstall",
      headline: "Uninstalled MCP server " + args.serverName,
      resolution,
      suggestions: [{ description: "Inspect MCP servers", cmd: "axm mcps list" }],
    });
  });
