import * as Layer from "effect/Layer";

import { InstallMcpServerCommandWorkflowActionsLive } from "../../root/mcp-servers/install/command-actions.js";
import { UninstallMcpServerCommandWorkflowActionsLive } from "../../root/mcp-servers/uninstall/command-actions.js";

import { McpServerManagerLive } from "@axm.sh/core/unstable/extension-managers";

const managerLayer = McpServerManagerLive;

const workflowActionsLayer = Layer.mergeAll(
  InstallMcpServerCommandWorkflowActionsLive,
  UninstallMcpServerCommandWorkflowActionsLive,
);

export const layer = Layer.provideMerge(workflowActionsLayer, managerLayer);
