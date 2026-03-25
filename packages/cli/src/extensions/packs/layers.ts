import * as Layer from "effect/Layer";

import { InstallPackCommandWorkflowActionsLive } from "../../cli-commands/packs/install/command-actions.js";
import { UninstallPackCommandWorkflowActionsLive } from "../../cli-commands/packs/uninstall/command-actions.js";

import { PackManagerLive } from "./manager.js";

const managerLayer = PackManagerLive;

const workflowActionsLayer = Layer.mergeAll(
  InstallPackCommandWorkflowActionsLive,
  UninstallPackCommandWorkflowActionsLive,
);

export const layer = Layer.provideMerge(workflowActionsLayer, managerLayer);
