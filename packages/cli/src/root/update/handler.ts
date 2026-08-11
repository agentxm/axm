import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  credentialFreeLocatorRecoveryValue,
  recoveryPositional,
  recoverySwitch,
  setCommandSemanticProperties,
  summarizeCommandOutcome,
  type PlanExecutionMode,
} from "@agentxm/client-core/unstable/cli-runtime";
import type { PlanResolution } from "@agentxm/client-core/unstable/plan";
import { runInstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";

import { emitPlanResolutionResult, planResolutionToSummary } from "../../json-output.js";
import {
  InstallMcpServerCommandWorkflowActions,
  type InstallMcpServerHandlerArgs,
} from "../mcps/install/command-actions.js";
import {
  InstallHookCommandWorkflowActions,
  type InstallHookHandlerArgs,
} from "../hooks/install/command-actions.js";
import {
  InstallKnowledgeCommandWorkflowActions,
  type InstallKnowledgeHandlerArgs,
} from "../knowledge/install/command-actions.js";
import {
  InstallPackCommandWorkflowActions,
  type InstallPackHandlerArgs,
} from "../packs/install/command-actions.js";
import {
  InstallRuleCommandWorkflowActions,
  type InstallRuleHandlerArgs,
} from "../rules/install/command-actions.js";
import { InstallSkillCommandWorkflowActions } from "../skills/install/command-actions.js";
import { InstallSubagentCommandWorkflowActions } from "../subagents/install/command-actions.js";
import { resolveRootUpdateIntent, type RootUpdateIntent } from "./resolve-root-update-intent.js";
import { handleWorkspaceUpdate } from "./workspace-update-handler.js";
import {
  makeConfirmationRecovery,
  makePlanExecutionMode,
} from "../shared/confirmation-recovery.js";

export interface RootUpdateFlags {
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export interface RootUpdateHandlerArgs extends RootUpdateFlags {
  readonly source: Option.Option<string>;
  readonly recoveryCommand?: ReadonlyArray<string>;
}

const runUpdateIntent = (intent: RootUpdateIntent, execution: PlanExecutionMode) =>
  Effect.gen(function* () {
    switch (intent.type) {
      case "skill": {
        const actions = yield* InstallSkillCommandWorkflowActions;
        return yield* runInstallCommandWorkflow(
          { source: intent.source, skills: [], all: false },
          actions,
          { execution },
        );
      }
      case "mcp-server": {
        const actions = yield* InstallMcpServerCommandWorkflowActions;
        const mcpArgs: InstallMcpServerHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(mcpArgs, actions, { execution });
      }
      case "rule": {
        const actions = yield* InstallRuleCommandWorkflowActions;
        const ruleArgs: InstallRuleHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(ruleArgs, actions, { execution });
      }
      case "hook": {
        const actions = yield* InstallHookCommandWorkflowActions;
        const hookArgs: InstallHookHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(hookArgs, actions, { execution });
      }
      case "knowledge": {
        const actions = yield* InstallKnowledgeCommandWorkflowActions;
        const knowledgeArgs: InstallKnowledgeHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(knowledgeArgs, actions, { execution });
      }
      case "subagent": {
        const actions = yield* InstallSubagentCommandWorkflowActions;
        return yield* runInstallCommandWorkflow(
          { source: intent.source, subagents: [], all: false },
          actions,
          { execution },
        );
      }
      case "pack": {
        const actions = yield* InstallPackCommandWorkflowActions;
        const packArgs: InstallPackHandlerArgs = { source: intent.source, unattended: true };
        return yield* runInstallCommandWorkflow(packArgs, actions, { execution });
      }
    }
  });

export const handleUpdate = (args: RootUpdateHandlerArgs) =>
  Option.match(args.source, {
    onNone: () =>
      handleWorkspaceUpdate({
        command: "update",
        type: Option.none(),
        planName: "Update configured extensions",
        planDescription: Option.some("Update configured workspace extensions"),
        flags: args,
      }),
    onSome: (source) =>
      Effect.gen(function* () {
        const execution = yield* makePlanExecutionMode(
          args,
          makeConfirmationRecovery(args.recoveryCommand ?? ["update"], [
            recoverySwitch("--refresh", args.force),
            recoveryPositional(credentialFreeLocatorRecoveryValue(source)),
          ]),
        );
        const intent = yield* resolveRootUpdateIntent(source);
        const resolution = yield* runUpdateIntent(intent, execution);
        const outputResolution: PlanResolution = resolution;
        yield* setCommandSemanticProperties(
          summarizeCommandOutcome(
            planResolutionToSummary(outputResolution, {
              subjectType: intent.type,
              sourceKind: "registry",
            }),
          ),
        );
        yield* emitPlanResolutionResult("update", outputResolution);
      }),
  });
