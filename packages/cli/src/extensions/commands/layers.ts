import * as Layer from "effect/Layer";

import { InstallCommandCommandWorkflowActionsLive } from "../../root/commands/install/command-actions.js";
import { UninstallCommandCommandWorkflowActionsLive } from "../../root/commands/uninstall/command-actions.js";

import { CommandManagerLive } from "@axm.sh/core/unstable/extension-managers";

const managerLayer = CommandManagerLive;

const workflowActionsLayer = Layer.mergeAll(
  InstallCommandCommandWorkflowActionsLive,
  UninstallCommandCommandWorkflowActionsLive,
);

export const layer = Layer.provideMerge(workflowActionsLayer, managerLayer);
