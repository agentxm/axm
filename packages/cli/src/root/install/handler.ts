import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  credentialFreeLocatorRecoveryValue,
  recoveryPositional,
  recoverySwitch,
  setCommandSemanticProperties,
  summarizeCommandOutcome,
  type PlanExecution,
} from "@agentxm/extension-management/unstable/cli-runtime";
import { makeAppError, type AppError } from "@agentxm/extension-management/unstable/app-error";
import { operationPresentation, type Plan } from "@agentxm/extension-management/unstable/plan";
import { runInstallCommandWorkflow } from "@agentxm/extension-management/unstable/workflows";

import { emitOperationResolution, operationResolutionSummary } from "../../operation-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { type InstallMcpServerHandlerArgs } from "../mcps/install/command-actions.js";
import { type InstallHookHandlerArgs } from "../hooks/install/command-actions.js";
import { type InstallKnowledgeHandlerArgs } from "../knowledge/install/command-actions.js";
import { type InstallPackHandlerArgs } from "../packs/install/command-actions.js";
import { type InstallRuleHandlerArgs } from "../rules/install/command-actions.js";
import {
  resolveRootInstallIntent,
  type RootInstallIntent,
  type RootInstallableType,
} from "./resolve-root-install-intent.js";
import { handleWorkspaceInstallWithActions } from "./workspace-install-handler.js";
import { makeConfirmationRecovery, makePlanExecution } from "../shared/confirmation-recovery.js";
import {
  makeInstallCommandActions,
  type InstallCommandActions,
} from "../shared/install-command-actions.js";

export interface RootInstallFlags {
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
  readonly ignoreReleaseAge?: boolean;
}

export interface RootInstallHandlerArgs extends RootInstallFlags {
  readonly source: Option.Option<string>;
}

type RegistryExtensionRootInstallIntent = RootInstallIntent & {
  readonly type: RootInstallableType;
};

const withInstallPresentation = (type: RootInstallableType) => (plan: Plan) =>
  Effect.succeed({
    ...plan,
    presentation: operationPresentation(
      { imperative: "install", past: "Installed", gerund: "Installing" },
      type,
    ),
  } satisfies Plan);

const runRegistryInstallIntent = (
  intent: RegistryExtensionRootInstallIntent,
  execution: PlanExecution,
  actions: InstallCommandActions,
) =>
  Effect.gen(function* () {
    const transformPlan = withInstallPresentation(intent.type);
    switch (intent.type) {
      case "skill": {
        return yield* runInstallCommandWorkflow(
          { source: intent.source, skills: [], all: false },
          actions.skill,
          { execution, transformPlan },
        );
      }
      case "mcp-server": {
        const mcpArgs: InstallMcpServerHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(mcpArgs, actions.mcpServer, {
          execution,
          transformPlan,
        });
      }
      case "rule": {
        const ruleArgs: InstallRuleHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(ruleArgs, actions.rule, {
          execution,
          transformPlan,
        });
      }
      case "hook": {
        const hookArgs: InstallHookHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(hookArgs, actions.hook, {
          execution,
          transformPlan,
        });
      }
      case "knowledge": {
        const knowledgeArgs: InstallKnowledgeHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(knowledgeArgs, actions.knowledge, {
          execution,
          transformPlan,
        });
      }
      case "subagent": {
        return yield* runInstallCommandWorkflow(
          { source: intent.source, subagents: [], all: false },
          actions.subagent,
          { execution, transformPlan },
        );
      }
      case "pack": {
        const packArgs: InstallPackHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(packArgs, actions.pack, {
          execution,
          transformPlan,
        });
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

const runLocatorInstallIntent = (
  source: string,
  execution: PlanExecution,
  actions: InstallCommandActions,
) =>
  Effect.gen(function* () {
    const attempts = [
      yield* runLocatorWorkflow(
        "skill",
        runInstallCommandWorkflow({ source, skills: [], all: true }, actions.skill, {
          execution,
          transformPlan: withInstallPresentation("skill"),
        }),
      ),
      yield* runLocatorWorkflow(
        "rule",
        runInstallCommandWorkflow({ source }, actions.rule, {
          execution,
          transformPlan: withInstallPresentation("rule"),
        }),
      ),
      yield* runLocatorWorkflow(
        "hook",
        runInstallCommandWorkflow({ source }, actions.hook, {
          execution,
          transformPlan: withInstallPresentation("hook"),
        }),
      ),
      yield* runLocatorWorkflow(
        "knowledge",
        runInstallCommandWorkflow({ source }, actions.knowledge, {
          execution,
          transformPlan: withInstallPresentation("knowledge"),
        }),
      ),
      yield* runLocatorWorkflow(
        "subagent",
        runInstallCommandWorkflow({ source, subagents: [], all: true }, actions.subagent, {
          execution,
          transformPlan: withInstallPresentation("subagent"),
        }),
      ),
    ];

    const successful = attempts.flatMap((attempt) =>
      Option.isSome(attempt) ? [attempt.value] : [],
    );

    if (successful.length === 0) {
      return yield* makeAppError({
        code: "not_found",
        detail:
          "No locator-discoverable extensions found in source (supported: skills, rules, hooks, knowledge, and subagents)",
      });
    }

    for (const item of successful) {
      yield* emitOperationResolution("install", item.resolution, {
        suggestions: [{ description: "Inspect workspace facts", cmd: "axm lint" }],
      });
    }
  });

const handleInstallWithActionEffect = <R>(
  args: RootInstallHandlerArgs,
  actionsEffect: Effect.Effect<InstallCommandActions, never, R>,
) =>
  withOperationLifecycle(
    {
      command: "install",
      mode: args.preview ? "preview" : "apply",
      planName: "Install configured extensions",
      presentation: operationPresentation({
        imperative: "install",
        past: "Installed",
        gerund: "Installing",
      }),
    },
    Effect.flatMap(actionsEffect, (actions) => handleInstallBody(args, actions)),
  );

export const handleInstall = (args: RootInstallHandlerArgs) =>
  handleInstallWithActionEffect(args, makeInstallCommandActions);

export const handleInstallWithActions = (
  args: RootInstallHandlerArgs,
  actions: InstallCommandActions,
) => handleInstallWithActionEffect(args, Effect.succeed(actions));

const handleInstallBody = (args: RootInstallHandlerArgs, actions: InstallCommandActions) =>
  Option.match(args.source, {
    onNone: () =>
      handleWorkspaceInstallWithActions(
        {
          command: "install",
          type: Option.none(),
          planName: "Install configured extensions",
          planDescription: Option.some("Install configured workspace extensions"),
          flags: args,
        },
        actions,
      ),
    onSome: (source) =>
      Effect.gen(function* () {
        const execution = yield* makePlanExecution(
          args,
          makeConfirmationRecovery(
            ["install"],
            [
              recoverySwitch("--reinstall", args.force),
              recoverySwitch("--ignore-release-age", args.ignoreReleaseAge === true),
              recoveryPositional(credentialFreeLocatorRecoveryValue(source)),
            ],
          ),
        );
        const intent = yield* resolveRootInstallIntent(source);
        if (intent.type === "locator") {
          yield* runLocatorInstallIntent(intent.source, execution, actions);
          return;
        }
        const resolution = yield* runRegistryInstallIntent(intent, execution, actions);
        yield* setCommandSemanticProperties(
          summarizeCommandOutcome(
            operationResolutionSummary(resolution, {
              subjectType: intent.type,
              sourceKind: "registry",
            }),
          ),
        );
        yield* emitOperationResolution("install", resolution, {
          suggestions: [{ description: "Inspect workspace facts", cmd: "axm lint" }],
        });
      }),
  });
