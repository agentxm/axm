import * as Effect from "effect/Effect";
import {
  setCommandSemanticProperties,
  summarizeCommandOutcome,
  type SuggestedAction,
} from "@agentxm/client-core/unstable/cli-runtime";
import { deriveOperationOutcome, operationPresentation } from "@agentxm/client-core/unstable/plan";
import {
  runUninstallCommandWorkflow,
  type UninstallExtensionCommandWorkflowActions,
} from "@agentxm/client-core/unstable/workflows";

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
  makeUninstallKnowledgeCommandWorkflowActions,
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

export interface RootUninstallFlags {
  readonly yes: boolean;
  readonly preview: boolean;
}

export interface RootUninstallHandlerArgs extends RootUninstallFlags {
  readonly source: string;
}

/** Root uninstall routes across every type, so it presents the default subject. */
const rootUninstallPresentation = operationPresentation({
  imperative: "uninstall",
  past: "Uninstalled",
  gerund: "Uninstalling",
});

const withRootPresentation = <Args, Parsed, Intent>(
  actions: UninstallExtensionCommandWorkflowActions<Args, Parsed, Intent>,
): UninstallExtensionCommandWorkflowActions<Args, Parsed, Intent> => ({
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

const runUninstallIntent = (args: RootUninstallHandlerArgs) =>
  Effect.gen(function* () {
    const execution = yield* makeUninstallPlanExecution(args, ["uninstall"], [args.source]);
    const intent = yield* resolveRootUninstallIntent(args.source);

    const resolution = yield* Effect.gen(function* () {
      switch (intent.type) {
        case "skill": {
          const actions = yield* UninstallSkillCommandWorkflowActions;
          const uninstallArgs: UninstallHandlerArgs = { skill: intent.name };
          return yield* runUninstallCommandWorkflow(uninstallArgs, withRootPresentation(actions), {
            execution,
          });
        }
        case "mcp-server": {
          const actions = yield* UninstallMcpServerCommandWorkflowActions;
          const uninstallArgs: UninstallMcpServerHandlerArgs = { serverName: intent.name };
          return yield* runUninstallCommandWorkflow(uninstallArgs, withRootPresentation(actions), {
            execution,
          });
        }
        case "rule": {
          const actions = yield* UninstallRuleCommandWorkflowActions;
          const uninstallArgs: UninstallRuleHandlerArgs = { name: intent.name };
          return yield* runUninstallCommandWorkflow(uninstallArgs, withRootPresentation(actions), {
            execution,
          });
        }
        case "hook": {
          const actions = yield* UninstallHookCommandWorkflowActions;
          const uninstallArgs: UninstallHookHandlerArgs = { name: intent.name };
          return yield* runUninstallCommandWorkflow(uninstallArgs, withRootPresentation(actions), {
            execution,
          });
        }
        case "knowledge": {
          const actions = yield* makeUninstallKnowledgeCommandWorkflowActions;
          const uninstallArgs: UninstallKnowledgeHandlerArgs = { name: intent.name };
          return yield* runUninstallCommandWorkflow(uninstallArgs, withRootPresentation(actions), {
            execution,
          });
        }
        case "subagent": {
          const actions = yield* UninstallSubagentCommandWorkflowActions;
          const uninstallArgs: UninstallSubagentHandlerArgs = { subagent: intent.name };
          return yield* runUninstallCommandWorkflow(uninstallArgs, withRootPresentation(actions), {
            execution,
          });
        }
        case "pack": {
          const actions = yield* UninstallPackCommandWorkflowActions;
          const uninstallArgs: UninstallPackHandlerArgs = { name: intent.name };
          return yield* runUninstallCommandWorkflow(uninstallArgs, withRootPresentation(actions), {
            execution,
          });
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

export const handleUninstall = (args: RootUninstallHandlerArgs) =>
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
    runUninstallIntent(args),
  );
