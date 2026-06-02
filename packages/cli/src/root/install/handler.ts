import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  setCommandSemanticProperties,
  summarizeCommandOutcome,
} from "@agentxm/client-core/unstable/cli-runtime";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
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
  InstallFilesCommandWorkflowActions,
  type InstallFilesHandlerArgs,
} from "../files/install/command-actions.js";
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
import {
  resolveRootInstallIntent,
  type RootInstallIntent,
  type RootInstallableType,
} from "./resolve-root-install-intent.js";
import { handleWorkspaceInstall } from "./workspace-install-handler.js";
import { runFilesWorkspaceGeneratorPhase } from "../files/workspace-generator-phase.js";

export interface RootInstallFlags {
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export interface RootInstallHandlerArgs extends RootInstallFlags {
  readonly source: Option.Option<string>;
}

type RegistryRootInstallIntent = RootInstallIntent & { readonly type: RootInstallableType };

const runRegistryInstallIntent = (intent: RegistryRootInstallIntent, args: RootInstallFlags) =>
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
      case "files": {
        const actions = yield* InstallFilesCommandWorkflowActions;
        const fileArgs: InstallFilesHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(fileArgs, actions, args);
      }
      case "rule": {
        const actions = yield* InstallRuleCommandWorkflowActions;
        const ruleArgs: InstallRuleHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(ruleArgs, actions, args);
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

const isNotFoundAppError = (error: unknown): error is AppError =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "AppError" &&
  "code" in error &&
  error.code === "not_found";

const runLocatorWorkflow = <A, E, R>(type: RootInstallableType, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.map((resolution) => Option.some({ type, resolution })),
    Effect.catch((error) =>
      isNotFoundAppError(error)
        ? Effect.succeed(
            Option.none<{ readonly type: RootInstallableType; readonly resolution: A }>(),
          )
        : Effect.fail(error),
    ),
  );

const runLocatorInstallIntent = (source: string, args: RootInstallFlags) =>
  Effect.gen(function* () {
    const skillActions = yield* InstallSkillCommandWorkflowActions;
    const commandActions = yield* InstallCommandCommandWorkflowActions;
    const fileActions = yield* InstallFilesCommandWorkflowActions;
    const ruleActions = yield* InstallRuleCommandWorkflowActions;
    const subagentActions = yield* InstallSubagentCommandWorkflowActions;

    const attempts = [
      yield* runLocatorWorkflow(
        "skill",
        runInstallCommandWorkflow({ source, skills: [], all: true }, skillActions, args),
      ),
      yield* runLocatorWorkflow(
        "command",
        runInstallCommandWorkflow(
          { source, yes: args.yes, force: args.force, preview: args.preview },
          commandActions,
          args,
        ),
      ),
      yield* runLocatorWorkflow("files", runInstallCommandWorkflow({ source }, fileActions, args)),
      yield* runLocatorWorkflow("rule", runInstallCommandWorkflow({ source }, ruleActions, args)),
      yield* runLocatorWorkflow(
        "subagent",
        runInstallCommandWorkflow({ source, subagents: [], all: true }, subagentActions, args),
      ),
    ];

    const successful = attempts.flatMap((attempt) =>
      Option.isSome(attempt) ? [attempt.value] : [],
    );

    if (successful.length === 0) {
      return yield* makeAppError({
        code: "not_found",
        detail: "No installable extensions found in source",
      });
    }

    for (const item of successful) {
      yield* emitPlanResolutionResult("install", item.resolution);
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
        if (intent.type === "locator") {
          yield* runLocatorInstallIntent(intent.source, args);
          return;
        }
        const resolution = yield* runRegistryInstallIntent(intent, args);
        if (!args.preview && (intent.type === "files" || intent.type === "pack")) {
          yield* runFilesWorkspaceGeneratorPhase({ dryRun: false });
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
