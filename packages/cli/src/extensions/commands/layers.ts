import * as Layer from "effect/Layer";

import { InstallCommandCommandWorkflowActionsLive } from "../../cli-commands/commands/install/command-actions.js";
import { UninstallCommandCommandWorkflowActionsLive } from "../../cli-commands/commands/uninstall/command-actions.js";

import { CommandManagerLive } from "./manager.js";

export const managerLayer = CommandManagerLive;

export const workflowActionsLayer = Layer.mergeAll(
  InstallCommandCommandWorkflowActionsLive,
  UninstallCommandCommandWorkflowActionsLive,
);
