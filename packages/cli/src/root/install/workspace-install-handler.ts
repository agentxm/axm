import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  setCommandSemanticProperties,
  summarizeCommandOutcome,
  type SubjectType,
} from "@agentxm/extension-management/unstable/cli-runtime";
import { previewOrApplyPlan, recoverySwitch } from "@agentxm/workspace-operations";
import { operationPresentation } from "@agentxm/workspace-operations";

import { emitOperationResolution, operationResolutionSummary } from "../../operation-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { buildWorkspaceInstallPlan, type WorkspaceInstallableType } from "./workspace-install.js";
import { makeConfirmationRecovery, makePlanExecution } from "../shared/confirmation-recovery.js";
import {
  makeInstallCommandActions,
  type InstallCommandActions,
} from "../shared/install-command-actions.js";

const workspaceInstallSubjectType = (type: Option.Option<WorkspaceInstallableType>): SubjectType =>
  Option.match(type, {
    onNone: () => "mixed" as const,
    onSome: (value) => value,
  });

const workspaceInstallCommand = (
  type: Option.Option<WorkspaceInstallableType>,
): ReadonlyArray<string> =>
  Option.match(type, {
    onNone: () => ["install"],
    onSome: (value) => {
      switch (value) {
        case "skill":
          return ["skills", "install"];
        case "mcp-server":
          return ["mcps", "install"];
        case "subagent":
          return ["subagents", "install"];
        case "rule":
          return ["rules", "install"];
        case "hook":
          return ["hooks", "install"];
        case "knowledge":
          return ["knowledge", "install"];
        case "pack":
          return ["packs", "install"];
      }
    },
  });

export interface WorkspaceInstallFlags {
  readonly yes: boolean;
  readonly preview: boolean;
  readonly force?: boolean;
  readonly ignoreReleaseAge?: boolean;
}

export interface WorkspaceInstallHandlerArgs {
  readonly command: string;
  readonly type: Option.Option<WorkspaceInstallableType>;
  readonly planName: string;
  readonly planDescription: Option.Option<string>;
  readonly flags: WorkspaceInstallFlags;
}

const handleWorkspaceInstallWithActionEffect = <R>(
  args: WorkspaceInstallHandlerArgs,
  actionsEffect: Effect.Effect<InstallCommandActions, never, R>,
) =>
  withOperationLifecycle(
    {
      command: args.command,
      mode: args.flags.preview ? "preview" : "apply",
      planName: args.planName,
      presentation: operationPresentation(
        { imperative: "install", past: "Installed", gerund: "Installing" },
        Option.getOrUndefined(args.type),
      ),
    },
    Effect.flatMap(actionsEffect, (actions) => handleWorkspaceInstallBody(args, actions)),
  );

export const handleWorkspaceInstall = (args: WorkspaceInstallHandlerArgs) =>
  handleWorkspaceInstallWithActionEffect(args, makeInstallCommandActions);

export const handleWorkspaceInstallWithActions = (
  args: WorkspaceInstallHandlerArgs,
  actions: InstallCommandActions,
) => handleWorkspaceInstallWithActionEffect(args, Effect.succeed(actions));

const handleWorkspaceInstallBody = (
  args: WorkspaceInstallHandlerArgs,
  actions: InstallCommandActions,
) =>
  Effect.gen(function* () {
    const planResult = yield* buildWorkspaceInstallPlan(
      {
        type: args.type,
        planName: args.planName,
        planDescription: args.planDescription,
        ignoreReleaseAge: args.flags.ignoreReleaseAge === true,
      },
      actions,
    );

    if (planResult._tag === "NoConfiguredExtensions") {
      yield* setCommandSemanticProperties(
        summarizeCommandOutcome({
          outcome: "no-op",
          subjectType: workspaceInstallSubjectType(args.type),
          sourceKind: "workspace",
        }),
      );
      yield* emitNoOpOutcome(args.command, {
        planName: args.planName,
        message: planResult.message,
        ...Option.match(args.planDescription, {
          onNone: () => ({}),
          onSome: (planDescription) => ({ planDescription }),
        }),
      });
      return;
    }

    const execution = yield* makePlanExecution(
      args.flags,
      makeConfirmationRecovery(workspaceInstallCommand(args.type), [
        recoverySwitch("--reinstall", args.flags.force === true),
        recoverySwitch("--ignore-release-age", args.flags.ignoreReleaseAge === true),
      ]),
      [],
      planResult.configuredAgentOperations,
    );
    const resolution = yield* previewOrApplyPlan(planResult.plan, { execution });
    yield* setCommandSemanticProperties(
      summarizeCommandOutcome(
        operationResolutionSummary(resolution, {
          subjectType: workspaceInstallSubjectType(args.type),
          sourceKind: "workspace",
        }),
      ),
    );
    yield* emitOperationResolution(args.command, resolution, {
      suggestions: [{ description: "Inspect workspace facts", cmd: "axm lint" }],
    });
  });
