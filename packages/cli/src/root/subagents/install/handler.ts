import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import { publicRecoveryValue, recoveryOption, recoverySwitch } from "@agentxm/workspace-operations";
import { deriveOperationOutcome } from "@agentxm/workspace-operations";
import { runInstallCommandWorkflow } from "@agentxm/extension-management/unstable/extension-lifecycle";

import { emitOperationResolution } from "../../../operation-output.js";
import { withOperationLifecycle } from "../../shared/operation-lifecycle.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
import { makeInstallPlanExecution } from "../../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import { InstallSubagentCommandWorkflowActions } from "./command-actions.js";

export interface InstallSubagentHandlerArgs {
  readonly source: Option.Option<string>;
  readonly subagents: readonly string[];
  readonly all: boolean;
}

export interface InstallSubagentFlags {
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

const validateWorkspaceInstallArgs = (args: InstallSubagentHandlerArgs) =>
  Effect.gen(function* () {
    if (args.all) {
      return yield* makeAppError({
        code: "usage",
        detail: "The --all flag requires a source for subagents install",
        suggestions: [
          {
            description: "Install all subagents from a source, or omit `--all`.",
            cmd: "axm subagents install <source> --all",
          },
        ],
      });
    }

    if (args.subagents.length > 0) {
      return yield* makeAppError({
        code: "usage",
        detail: "The --subagent flag requires a source for subagents install",
        suggestions: [
          {
            description: "Install a named subagent from a source, or omit `--subagent`.",
            cmd: "axm subagents install <source> --subagent <name>",
          },
        ],
      });
    }
  });

type InstallSubagentActions = Effect.Success<typeof InstallSubagentCommandWorkflowActions>;

const handleInstallWithActionEffect = <R>(
  args: InstallSubagentHandlerArgs,
  flags: InstallSubagentFlags,
  actionsEffect: Effect.Effect<InstallSubagentActions, never, R>,
) =>
  withOperationLifecycle(
    {
      command: "subagents.install",
      mode: flags.preview ? "preview" : "apply",
      planName: "Install subagents",
    },
    handleInstallBody(args, flags, actionsEffect),
  );

export const handleInstall = (args: InstallSubagentHandlerArgs, flags: InstallSubagentFlags) =>
  handleInstallWithActionEffect(args, flags, InstallSubagentCommandWorkflowActions);

export const handleInstallWithActions = (
  args: InstallSubagentHandlerArgs,
  flags: InstallSubagentFlags,
  actions: InstallSubagentActions,
) => handleInstallWithActionEffect(args, flags, Effect.succeed(actions));

const handleInstallBody = <R>(
  args: InstallSubagentHandlerArgs,
  flags: InstallSubagentFlags,
  actionsEffect: Effect.Effect<InstallSubagentActions, never, R>,
) =>
  Effect.gen(function* () {
    if (Option.isNone(args.source)) {
      yield* validateWorkspaceInstallArgs(args);
      return yield* handleWorkspaceInstall({
        command: "subagents.install",
        type: Option.some("subagent"),
        planName: "Install subagents",
        planDescription: Option.some("Install configured subagents"),
        flags,
      });
    }

    const actions = yield* actionsEffect;
    const execution = yield* makeInstallPlanExecution(
      flags,
      ["subagents", "install"],
      [args.source.value],
      [
        recoverySwitch("--all", args.all),
        ...args.subagents.map((subagent) =>
          recoveryOption("--subagent", publicRecoveryValue(subagent)),
        ),
      ],
    );
    const resolution = yield* runInstallCommandWorkflow(
      { source: args.source.value, subagents: args.subagents, all: args.all },
      actions,
      { execution },
    );
    if (deriveOperationOutcome(resolution) === "no-op" && resolution.units.length === 0) {
      const planDescription = Option.getOrUndefined(resolution.description);
      yield* emitNoOpOutcome("subagents.install", {
        planName: resolution.name,
        ...(planDescription === undefined ? {} : { planDescription }),
        message: "No subagents installed.",
      });
      return;
    }

    yield* emitOperationResolution("subagents.install", resolution, {
      suggestions: [{ description: "Inspect installed subagents", cmd: "axm subagents list" }],
    });
  });
