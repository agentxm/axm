import * as Layer from "effect/Layer";

import { InstallSkillCommandWorkflowActionsLive } from "../../cli-commands/skills/install/command-actions.js";
import { UninstallSkillCommandWorkflowActionsLive } from "../../cli-commands/skills/uninstall/command-actions.js";

import { SkillManagerLive } from "./manager.js";

export const managerLayer = SkillManagerLive;

export const workflowActionsLayer = Layer.mergeAll(
  InstallSkillCommandWorkflowActionsLive,
  UninstallSkillCommandWorkflowActionsLive,
);
