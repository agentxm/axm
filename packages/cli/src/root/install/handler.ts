import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  setCommandSemanticProperties,
  summarizeCommandOutcome,
} from "@agentxm/client-core/unstable/cli-runtime";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import type { PlanResolution } from "@agentxm/client-core/unstable/plan";
import { runInstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";

import { planResolutionToSummary, toPlanResolutionResult } from "../../json-output.js";
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
import {
  resolveRootInstallIntent,
  type RootInstallIntent,
  type RootInstallableType,
} from "./resolve-root-install-intent.js";
import { handleWorkspaceInstall } from "./workspace-install-handler.js";
import {
  mergePlanResolution,
  runFilesWorkspaceGeneratorPhase,
} from "../files/workspace-generator-phase.js";
import { emitAppliedPlanOutcome, unchangedPlanHeadline } from "../shared/applied-plan-output.js";

export interface RootInstallFlags {
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export interface RootInstallHandlerArgs extends RootInstallFlags {
  readonly source: Option.Option<string>;
}

type RegistryExtensionRootInstallIntent = RootInstallIntent & {
  readonly type: RootInstallableType;
};

const runRegistryInstallIntent = (
  intent: RegistryExtensionRootInstallIntent,
  args: RootInstallFlags,
) =>
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
      case "hook": {
        const actions = yield* InstallHookCommandWorkflowActions;
        const hookArgs: InstallHookHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(hookArgs, actions, args);
      }
      case "knowledge": {
        const actions = yield* InstallKnowledgeCommandWorkflowActions;
        const knowledgeArgs: InstallKnowledgeHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(knowledgeArgs, actions, args);
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

const isLocatorNoMatchAppError = (error: unknown): error is AppError =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "AppError" &&
  "code" in error &&
  (error.code === "not_found" || error.code === "usage");

const runLocatorWorkflow = <A, E, R>(type: RootInstallableType, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.map((resolution) => Option.some({ type, resolution })),
    Effect.catch((error) =>
      isLocatorNoMatchAppError(error)
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
    const hookActions = yield* InstallHookCommandWorkflowActions;
    const knowledgeActions = yield* InstallKnowledgeCommandWorkflowActions;
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
      yield* runLocatorWorkflow("hook", runInstallCommandWorkflow({ source }, hookActions, args)),
      yield* runLocatorWorkflow(
        "knowledge",
        runInstallCommandWorkflow({ source }, knowledgeActions, args),
      ),
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
        detail:
          "No locator-discoverable extensions found in source (supported: skills, commands, files, rules, hooks, knowledge, and subagents)",
      });
    }

    for (const item of successful) {
      const result = toPlanResolutionResult(item.resolution);
      yield* emitAppliedPlanOutcome({
        command: "install",
        headline:
          result.outcome === "no-op"
            ? unchangedPlanHeadline(
                item.resolution,
                `${item.type} extensions are already up to date`,
              )
            : `Installed ${item.type} extensions from ${source}`,
        resolution: item.resolution,
        reportInstallationCoverage: item.type !== "knowledge",
        suggestions: [{ description: "Inspect workspace status", cmd: "axm status" }],
      });
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
        let outputResolution: PlanResolution = resolution;
        if (!args.preview && (intent.type === "files" || intent.type === "pack")) {
          const workspaceGeneratorResolution = yield* runFilesWorkspaceGeneratorPhase({
            dryRun: false,
          });
          outputResolution = mergePlanResolution(resolution, workspaceGeneratorResolution);
        }
        yield* setCommandSemanticProperties(
          summarizeCommandOutcome(
            planResolutionToSummary(outputResolution, {
              subjectType: intent.type,
              sourceKind: "registry",
            }),
          ),
        );
        const result = toPlanResolutionResult(outputResolution);
        yield* emitAppliedPlanOutcome({
          command: "install",
          headline:
            result.outcome === "no-op"
              ? unchangedPlanHeadline(outputResolution, `${intent.type} is already up to date`)
              : `Installed ${intent.type} ${source}`,
          resolution: outputResolution,
          reportInstallationCoverage: intent.type !== "knowledge",
          suggestions: [{ description: "Inspect workspace status", cmd: "axm status" }],
        });
      }),
  });
