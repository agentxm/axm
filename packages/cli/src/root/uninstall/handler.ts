import * as Effect from "effect/Effect";
import {
  setCommandSemanticProperties,
  summarizeCommandOutcome,
} from "@agentxm/client-core/unstable/cli-runtime";
import { runUninstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";

import { emitPlanResolutionResult, planResolutionToSummary } from "../../json-output.js";
import {
  UninstallCommandCommandWorkflowActions,
  type UninstallCommandHandlerArgs,
} from "../commands/uninstall/command-actions.js";
import {
  UninstallMcpServerCommandWorkflowActions,
  type UninstallMcpServerHandlerArgs,
} from "../mcps/uninstall/command-actions.js";
import {
  UninstallContextCommandWorkflowActions,
  type UninstallContextHandlerArgs,
} from "../context/uninstall/command-actions.js";
import {
  UninstallPackCommandWorkflowActions,
  type UninstallPackHandlerArgs,
} from "../packs/uninstall/command-actions.js";
import {
  UninstallSkillCommandWorkflowActions,
  type UninstallHandlerArgs,
} from "../skills/uninstall/command-actions.js";
import {
  UninstallSubagentCommandWorkflowActions,
  type UninstallSubagentHandlerArgs,
} from "../subagents/uninstall/command-actions.js";
import { resolveRootUninstallIntent } from "./resolve-root-uninstall-intent.js";

export interface RootUninstallFlags {
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export interface RootUninstallHandlerArgs extends RootUninstallFlags {
  readonly source: string;
}

const runUninstallIntent = (args: RootUninstallHandlerArgs) =>
  Effect.gen(function* () {
    const intent = yield* resolveRootUninstallIntent(args.source);

    const resolution = yield* Effect.gen(function* () {
      switch (intent.type) {
        case "skill": {
          const actions = yield* UninstallSkillCommandWorkflowActions;
          const uninstallArgs: UninstallHandlerArgs = { skill: intent.name };
          return yield* runUninstallCommandWorkflow(uninstallArgs, actions, args);
        }
        case "command": {
          const actions = yield* UninstallCommandCommandWorkflowActions;
          const uninstallArgs: UninstallCommandHandlerArgs = { commandName: intent.name };
          return yield* runUninstallCommandWorkflow(uninstallArgs, actions, args);
        }
        case "mcp-server": {
          const actions = yield* UninstallMcpServerCommandWorkflowActions;
          const uninstallArgs: UninstallMcpServerHandlerArgs = { serverName: intent.name };
          return yield* runUninstallCommandWorkflow(uninstallArgs, actions, args);
        }
        case "context": {
          const actions = yield* UninstallContextCommandWorkflowActions;
          const uninstallArgs: UninstallContextHandlerArgs = { name: intent.name };
          return yield* runUninstallCommandWorkflow(uninstallArgs, actions, args);
        }
        case "subagent": {
          const actions = yield* UninstallSubagentCommandWorkflowActions;
          const uninstallArgs: UninstallSubagentHandlerArgs = { subagent: intent.name };
          return yield* runUninstallCommandWorkflow(uninstallArgs, actions, args);
        }
        case "pack": {
          const actions = yield* UninstallPackCommandWorkflowActions;
          const uninstallArgs: UninstallPackHandlerArgs = { name: intent.name };
          return yield* runUninstallCommandWorkflow(uninstallArgs, actions, args);
        }
      }
    });

    yield* setCommandSemanticProperties(
      summarizeCommandOutcome(
        planResolutionToSummary(resolution, {
          subjectType: intent.type,
          sourceKind: "registry",
        }),
      ),
    );
    yield* emitPlanResolutionResult("uninstall", resolution);
  });

export const handleUninstall = (args: RootUninstallHandlerArgs) => runUninstallIntent(args);
