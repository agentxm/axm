import * as Effect from "effect/Effect";
import { operationPresentation } from "@agentxm/extension-management/unstable/plan";
import { runUninstallCommandWorkflow } from "@agentxm/extension-management/unstable/workflows";

import { emitOperationResolution } from "../../../operation-output.js";
import { withOperationLifecycle } from "../../shared/operation-lifecycle.js";
import { makeUninstallPlanExecution } from "../../shared/confirmation-recovery.js";
import {
  UninstallMcpServerCommandWorkflowActions,
  type UninstallMcpServerHandlerArgs,
} from "./command-actions.js";

const uninstallPresentation = operationPresentation(
  { imperative: "uninstall", past: "Uninstalled", gerund: "Uninstalling" },
  "mcp-server",
);

export const handleUninstallMcpServer = (
  args: UninstallMcpServerHandlerArgs,
  flags: { yes: boolean; preview: boolean },
) =>
  withOperationLifecycle(
    {
      command: "mcps.uninstall",
      mode: flags.preview ? "preview" : "apply",
      planName: "Uninstall MCP server",
      presentation: uninstallPresentation,
    },
    handleUninstallMcpServerBody(args, flags),
  );

const handleUninstallMcpServerBody = (
  args: UninstallMcpServerHandlerArgs,
  flags: { yes: boolean; preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallMcpServerCommandWorkflowActions;
    const presentedActions: typeof actions = {
      ...actions,
      buildUninstallPlan: (intent, workflowFlags) =>
        actions
          .buildUninstallPlan(intent, workflowFlags)
          .pipe(Effect.map((plan) => ({ ...plan, presentation: uninstallPresentation }))),
    };
    const execution = yield* makeUninstallPlanExecution(
      flags,
      ["mcps", "uninstall"],
      [args.serverName],
    );
    const resolution = yield* runUninstallCommandWorkflow(args, presentedActions, { execution });
    yield* emitOperationResolution("mcps.uninstall", resolution, {
      suggestions: [{ description: "Inspect MCP servers", cmd: "axm mcps list" }],
    });
  });
