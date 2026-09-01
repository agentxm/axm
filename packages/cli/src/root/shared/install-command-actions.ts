import * as Effect from "effect/Effect";
import type { LifecycleResolutionProgress } from "@agentxm/extension-lifecycle";

import { InstallHookCommandWorkflowActions } from "../hooks/install/command-actions.js";
import { InstallKnowledgeCommandWorkflowActions } from "../knowledge/install/command-actions.js";
import { InstallMcpServerCommandWorkflowActions } from "../mcps/install/command-actions.js";
import { InstallPackCommandWorkflowActions } from "../packs/install/command-actions.js";
import { InstallRuleCommandWorkflowActions } from "../rules/install/command-actions.js";
import { InstallSkillCommandWorkflowActions } from "../skills/install/command-actions.js";
import { InstallSubagentCommandWorkflowActions } from "../subagents/install/command-actions.js";

export interface InstallCommandActions {
  readonly skill: Effect.Success<typeof InstallSkillCommandWorkflowActions>;
  readonly rule: Effect.Success<typeof InstallRuleCommandWorkflowActions>;
  readonly hook: Effect.Success<typeof InstallHookCommandWorkflowActions>;
  readonly knowledge: Effect.Success<typeof InstallKnowledgeCommandWorkflowActions>;
  readonly subagent: Effect.Success<typeof InstallSubagentCommandWorkflowActions>;
  readonly mcpServer: Effect.Success<typeof InstallMcpServerCommandWorkflowActions>;
  readonly pack: Effect.Success<typeof InstallPackCommandWorkflowActions>;
}

// The lifecycle workflows' resolution-progress port joins the context so the
// root handler and the per-type workflow branches keep one requirements shape.
type InstallCommandActionContext =
  | LifecycleResolutionProgress
  | Effect.Services<typeof InstallSkillCommandWorkflowActions>
  | Effect.Services<typeof InstallRuleCommandWorkflowActions>
  | Effect.Services<typeof InstallHookCommandWorkflowActions>
  | Effect.Services<typeof InstallKnowledgeCommandWorkflowActions>
  | Effect.Services<typeof InstallSubagentCommandWorkflowActions>
  | Effect.Services<typeof InstallMcpServerCommandWorkflowActions>
  | Effect.Services<typeof InstallPackCommandWorkflowActions>;

export const makeInstallCommandActions: Effect.Effect<
  InstallCommandActions,
  never,
  InstallCommandActionContext
> = Effect.all({
  skill: InstallSkillCommandWorkflowActions,
  rule: InstallRuleCommandWorkflowActions,
  hook: InstallHookCommandWorkflowActions,
  knowledge: InstallKnowledgeCommandWorkflowActions,
  subagent: InstallSubagentCommandWorkflowActions,
  mcpServer: InstallMcpServerCommandWorkflowActions,
  pack: InstallPackCommandWorkflowActions,
});
