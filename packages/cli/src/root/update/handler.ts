import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  setCommandSemanticProperties,
  summarizeCommandOutcome,
} from "@agentxm/client-core/unstable/cli-runtime";
import { runInstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";

import { emitPlanResolutionResult, planResolutionToSummary } from "../../json-output.js";
import {
  InstallCommandCommandWorkflowActions,
  type InstallCommandHandlerArgs,
} from "../commands/install/command-actions.js";
import {
  InstallMcpServerCommandWorkflowActions,
  type InstallMcpServerHandlerArgs,
} from "../mcp-servers/install/command-actions.js";
import {
  InstallPackCommandWorkflowActions,
  type InstallPackHandlerArgs,
} from "../packs/install/command-actions.js";
import { InstallSkillCommandWorkflowActions } from "../skills/install/command-actions.js";
import { InstallSubagentCommandWorkflowActions } from "../subagents/install/command-actions.js";
import { resolveRootUpdateIntent, type RootUpdateIntent } from "./resolve-root-update-intent.js";
import { handleWorkspaceUpdate } from "./workspace-update-handler.js";

export interface RootUpdateFlags {
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export interface RootUpdateHandlerArgs extends RootUpdateFlags {
  readonly source: Option.Option<string>;
}

const runUpdateIntent = (intent: RootUpdateIntent, args: RootUpdateFlags) =>
  Effect.gen(function* () {
    switch (intent.type) {
      case "skill": {
        const actions = yield* InstallSkillCommandWorkflowActions;
        return yield* runInstallCommandWorkflow(
          { source: intent.source, skills: [], all: false },
          actions,
          args,
        );
      }
      case "command": {
        const actions = yield* InstallCommandCommandWorkflowActions;
        const commandArgs: InstallCommandHandlerArgs = { ...args, source: intent.source };
        return yield* runInstallCommandWorkflow(commandArgs, actions, {
          yes: commandArgs.yes,
          force: commandArgs.force,
          preview: commandArgs.preview,
        });
      }
      case "mcp-server": {
        const actions = yield* InstallMcpServerCommandWorkflowActions;
        const mcpArgs: InstallMcpServerHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(mcpArgs, actions, args);
      }
      case "subagent": {
        const actions = yield* InstallSubagentCommandWorkflowActions;
        return yield* runInstallCommandWorkflow(
          { source: intent.source, subagents: [], all: false },
          actions,
          args,
        );
      }
      case "pack": {
        const actions = yield* InstallPackCommandWorkflowActions;
        const packArgs: InstallPackHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(packArgs, actions, args);
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
        const intent = yield* resolveRootUpdateIntent(source);
        const resolution = yield* runUpdateIntent(intent, args);
        yield* setCommandSemanticProperties(
          summarizeCommandOutcome(
            planResolutionToSummary(resolution, {
              subjectType: intent.type,
              sourceKind: "registry",
            }),
          ),
        );
        yield* emitPlanResolutionResult("update", resolution);
      }),
  });
