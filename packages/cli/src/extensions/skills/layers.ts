import * as Layer from "effect/Layer";

import { InstallSkillCommandWorkflowActionsLive } from "../../root/skills/install/command-actions.js";
import { UninstallSkillCommandWorkflowActionsLive } from "../../root/skills/uninstall/command-actions.js";

import { SkillManagerLive } from "@axm.sh/core/unstable/extension-managers";

const managerLayer = SkillManagerLive;

const workflowActionsLayer = Layer.mergeAll(
  InstallSkillCommandWorkflowActionsLive,
  UninstallSkillCommandWorkflowActionsLive,
);

export const layer = Layer.provideMerge(workflowActionsLayer, managerLayer);
