import * as Layer from "effect/Layer";

import { InstallMcpServerCommandWorkflowActionsLive } from "../../cli-commands/mcp-servers/install/command-actions.js";
import { UninstallMcpServerCommandWorkflowActionsLive } from "../../cli-commands/mcp-servers/uninstall/command-actions.js";

import { McpServerManagerLive } from "./manager.js";

const managerLayer = McpServerManagerLive;

const workflowActionsLayer = Layer.mergeAll(
  InstallMcpServerCommandWorkflowActionsLive,
  UninstallMcpServerCommandWorkflowActionsLive,
);

export const layer = Layer.provideMerge(workflowActionsLayer, managerLayer);
