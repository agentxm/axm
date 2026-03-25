import * as Layer from "effect/Layer";

import { InstallMcpServerCommandWorkflowActionsLive } from "../../cli-commands/mcp-servers/install/command-actions.js";
import { UninstallMcpServerCommandWorkflowActionsLive } from "../../cli-commands/mcp-servers/uninstall/command-actions.js";

import { McpServerManagerLive } from "./manager.js";

export const managerLayer = McpServerManagerLive;

export const workflowActionsLayer = Layer.mergeAll(
  InstallMcpServerCommandWorkflowActionsLive,
  UninstallMcpServerCommandWorkflowActionsLive,
);
