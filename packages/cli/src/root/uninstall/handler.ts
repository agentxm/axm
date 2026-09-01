import * as Effect from "effect/Effect";
import {
  setCommandSemanticProperties,
  summarizeCommandOutcome,
} from "@agentxm/extension-management/unstable/cli-runtime";
import { type SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { deriveOperationOutcome, operationPresentation } from "@agentxm/workspace-operations";
import {
  type UninstallExtensionCommandWorkflowActions,
  runUninstallCommandWorkflow,
} from "@agentxm/extension-lifecycle";

import { emitOperationResolution, operationResolutionSummary } from "../../operation-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import {
  UninstallMcpServerCommandWorkflowActions,
  type UninstallMcpServerHandlerArgs,
} from "../mcps/uninstall/command-actions.js";
import {
  UninstallHookCommandWorkflowActions,
  type UninstallHookHandlerArgs,
} from "../hooks/uninstall/command-actions.js";
import {
  UninstallKnowledgeCommandWorkflowActions,
  type UninstallKnowledgeHandlerArgs,
} from "../knowledge/uninstall/command-actions.js";
import {
  UninstallPackCommandWorkflowActions,
  type UninstallPackHandlerArgs,
} from "../packs/uninstall/command-actions.js";
import {
  UninstallRuleCommandWorkflowActions,
  type UninstallRuleHandlerArgs,
} from "../rules/uninstall/command-actions.js";
import {
  UninstallSkillCommandWorkflowActions,
  type UninstallHandlerArgs,
} from "../skills/uninstall/command-actions.js";
import {
  UninstallSubagentCommandWorkflowActions,
  type UninstallSubagentHandlerArgs,
} from "../subagents/uninstall/command-actions.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { makeUninstallPlanExecution } from "../shared/confirmation-recovery.js";
import {
  resolveRootUninstallIntent,
  type RootUninstallableType,
} from "./resolve-root-uninstall-intent.js";
import { type AppError } from "@agentxm/extension-management/unstable/app-error";

export interface RootUninstallFlags {
  readonly yes: boolean;
  readonly preview: boolean;
}

export interface RootUninstallHandlerArgs extends RootUninstallFlags {
  readonly source: string;
}

export interface RootUninstallActions {
  readonly skill: Effect.Success<typeof UninstallSkillCommandWorkflowActions>;
  readonly mcpServer: Effect.Success<typeof UninstallMcpServerCommandWorkflowActions>;
  readonly subagent: Effect.Success<typeof UninstallSubagentCommandWorkflowActions>;
  readonly rule: Effect.Success<typeof UninstallRuleCommandWorkflowActions>;
  readonly hook: Effect.Success<typeof UninstallHookCommandWorkflowActions>;
  readonly knowledge: Effect.Success<typeof UninstallKnowledgeCommandWorkflowActions>;
  readonly pack: Effect.Success<typeof UninstallPackCommandWorkflowActions>;
}

const makeRootUninstallActions = Effect.all({
  skill: UninstallSkillCommandWorkflowActions,
  mcpServer: UninstallMcpServerCommandWorkflowActions,
  subagent: UninstallSubagentCommandWorkflowActions,
  rule: UninstallRuleCommandWorkflowActions,
  hook: UninstallHookCommandWorkflowActions,
  knowledge: UninstallKnowledgeCommandWorkflowActions,
  pack: UninstallPackCommandWorkflowActions,
});

/** Root uninstall routes across every type, so it presents the default subject. */
const rootUninstallPresentation = operationPresentation({
  imperative: "uninstall",
  past: "Uninstalled",
  gerund: "Uninstalling",
});

const withRootPresentation = <Args, Parsed, Intent>(
  actions: UninstallExtensionCommandWorkflowActions<Args, Parsed, Intent, AppError>,
): UninstallExtensionCommandWorkflowActions<Args, Parsed, Intent, AppError> => ({
  ...actions,
  buildUninstallPlan: (intent, flags) =>
    actions
      .buildUninstallPlan(intent, flags)
      .pipe(Effect.map((plan) => ({ ...plan, presentation: rootUninstallPresentation }))),
});

const uninstallSuggestions = (type: RootUninstallableType): ReadonlyArray<SuggestedAction> => {
  switch (type) {
    case "skill":
      return [{ description: "Inspect installed skills", cmd: "axm skills list" }];
    case "mcp-server":
      return [{ description: "Inspect MCP servers", cmd: "axm mcps list" }];
    case "rule":
      return [{ description: "Inspect installed rules", cmd: "axm rules list" }];
    case "hook":
      return [{ description: "Inspect installed hooks packages", cmd: "axm hooks list" }];
    case "knowledge":
      return [{ description: "Inspect installed knowledge", cmd: "axm knowledge list" }];
    case "subagent":
      return [{ description: "Inspect installed subagents", cmd: "axm subagents list" }];
    case "pack":
      return [{ description: "Inspect installed packs", cmd: "axm packs list" }];
  }
};

const uninstallNoOpMessage = (
  type: RootUninstallableType,
  name: string,
  alreadyAbsent: boolean,
): string => {
  switch (type) {
    case "skill":
      return alreadyAbsent
        ? `No skills uninstalled; ${name} is not installed.`
        : "No skills uninstalled.";
    case "mcp-server":
      return "No MCP servers uninstalled.";
    case "rule":
      return "No rules uninstalled.";
    case "hook":
      return "No hooks packages uninstalled.";
    case "knowledge":
      return "No knowledge bundles uninstalled.";
    case "subagent":
      return "No subagents uninstalled.";
    case "pack":
      return "No packs uninstalled.";
  }
};

const runUninstallIntent = (args: RootUninstallHandlerArgs, actions: RootUninstallActions) =>
  Effect.gen(function* () {
    const execution = yield* makeUninstallPlanExecution(args, ["uninstall"], [args.source]);
    const intent = yield* resolveRootUninstallIntent(args.source);

    const resolution = yield* Effect.gen(function* () {
      switch (intent.type) {
        case "skill": {
          const uninstallArgs: UninstallHandlerArgs = { skill: intent.name };
          return yield* runUninstallCommandWorkflow(
            uninstallArgs,
            withRootPresentation(actions.skill),
            {
              execution,
            },
          );
        }
        case "mcp-server": {
          const uninstallArgs: UninstallMcpServerHandlerArgs = { serverName: intent.name };
          return yield* runUninstallCommandWorkflow(
            uninstallArgs,
            withRootPresentation(actions.mcpServer),
            {
              execution,
            },
          );
        }
        case "rule": {
          const uninstallArgs: UninstallRuleHandlerArgs = { name: intent.name };
          return yield* runUninstallCommandWorkflow(
            uninstallArgs,
            withRootPresentation(actions.rule),
            {
              execution,
            },
          );
        }
        case "hook": {
          const uninstallArgs: UninstallHookHandlerArgs = { name: intent.name };
          return yield* runUninstallCommandWorkflow(
            uninstallArgs,
            withRootPresentation(actions.hook),
            {
              execution,
            },
          );
        }
        case "knowledge": {
          const uninstallArgs: UninstallKnowledgeHandlerArgs = { name: intent.name };
          return yield* runUninstallCommandWorkflow(
            uninstallArgs,
            withRootPresentation(actions.knowledge),
            {
              execution,
            },
          );
        }
        case "subagent": {
          const uninstallArgs: UninstallSubagentHandlerArgs = { subagent: intent.name };
          return yield* runUninstallCommandWorkflow(
            uninstallArgs,
            withRootPresentation(actions.subagent),
            {
              execution,
            },
          );
        }
        case "pack": {
          const uninstallArgs: UninstallPackHandlerArgs = { name: intent.name };
          return yield* runUninstallCommandWorkflow(
            uninstallArgs,
            withRootPresentation(actions.pack),
            {
              execution,
            },
          );
        }
      }
    });

    yield* setCommandSemanticProperties(
      summarizeCommandOutcome(
        operationResolutionSummary(resolution, {
          subjectType: intent.type,
          sourceKind: "registry",
        }),
      ),
    );
    const allUnitsAlreadyAbsent =
      resolution.units.length > 0 &&
      resolution.units.every(
        (unit) => unit.message === "not installed" || unit.state === "unchanged",
      );
    if (deriveOperationOutcome(resolution) === "no-op" || allUnitsAlreadyAbsent) {
      yield* emitNoOpOutcome("uninstall", {
        planName: resolution.name,
        message: uninstallNoOpMessage(intent.type, intent.name, allUnitsAlreadyAbsent),
      });
      return;
    }

    yield* emitOperationResolution("uninstall", resolution, {
      suggestions: uninstallSuggestions(intent.type),
    });
  });

const handleUninstallWithActionEffect = <R>(
  args: RootUninstallHandlerArgs,
  actionsEffect: Effect.Effect<RootUninstallActions, never, R>,
) =>
  withOperationLifecycle(
    {
      command: "uninstall",
      mode: args.preview ? "preview" : "apply",
      planName: "Uninstall extension",
      presentation: operationPresentation({
        imperative: "uninstall",
        past: "Uninstalled",
        gerund: "Uninstalling",
      }),
    },
    Effect.flatMap(actionsEffect, (actions) => runUninstallIntent(args, actions)),
  );

export const handleUninstall = (args: RootUninstallHandlerArgs) =>
  handleUninstallWithActionEffect(args, makeRootUninstallActions);

export const handleUninstallWithActions = (
  args: RootUninstallHandlerArgs,
  actions: RootUninstallActions,
) => handleUninstallWithActionEffect(args, Effect.succeed(actions));
