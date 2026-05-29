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
} from "../mcps/install/command-actions.js";
import {
  InstallDocsCommandWorkflowActions,
  type InstallDocsHandlerArgs,
} from "../docs/install/command-actions.js";
import {
  InstallPackCommandWorkflowActions,
  type InstallPackHandlerArgs,
} from "../packs/install/command-actions.js";
import { InstallSkillCommandWorkflowActions } from "../skills/install/command-actions.js";
import { InstallSubagentCommandWorkflowActions } from "../subagents/install/command-actions.js";
import { resolveRootInstallIntent, type RootInstallIntent } from "./resolve-root-install-intent.js";
import { handleWorkspaceInstall } from "./workspace-install-handler.js";
import { runDocsWorkspaceGeneratorPhase } from "../docs/workspace-generator-phase.js";

export interface RootInstallFlags {
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export interface RootInstallHandlerArgs extends RootInstallFlags {
  readonly source: Option.Option<string>;
}

const runInstallIntent = (intent: RootInstallIntent, args: RootInstallFlags) =>
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
      case "docs": {
        const actions = yield* InstallDocsCommandWorkflowActions;
        const fileArgs: InstallDocsHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(fileArgs, actions, args);
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

export const handleInstall = (args: RootInstallHandlerArgs) =>
  Option.match(args.source, {
    onNone: () =>
      handleWorkspaceInstall({
        command: "install",
        type: Option.none(),
        planName: "Install configured extensions",
        planDescription: Option.some("Install configured workspace extensions"),
        flags: args,
      }),
    onSome: (source) =>
      Effect.gen(function* () {
        const intent = yield* resolveRootInstallIntent(source);
        const resolution = yield* runInstallIntent(intent, args);
        if (!args.preview && (intent.type === "docs" || intent.type === "pack")) {
          yield* runDocsWorkspaceGeneratorPhase({ dryRun: false });
        }
        yield* setCommandSemanticProperties(
          summarizeCommandOutcome(
            planResolutionToSummary(resolution, {
              subjectType: intent.type,
              sourceKind: "registry",
            }),
          ),
        );
        yield* emitPlanResolutionResult("install", resolution);
      }),
  });
