import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  publicRecoveryValue,
  recoveryOption,
  recoverySwitch,
} from "@agentxm/client-core/unstable/cli-runtime";
import { runInstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";

import { toPlanResolutionResult } from "../../../json-output.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
import { emitAppliedPlanOutcome, unchangedPlanHeadline } from "../../shared/applied-plan-output.js";
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

export const handleInstall = (args: InstallSubagentHandlerArgs, flags: InstallSubagentFlags) =>
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

    const actions = yield* InstallSubagentCommandWorkflowActions;
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
      { execution, displayApplied: false },
    );
    const result = toPlanResolutionResult(resolution);
    if (result.outcome === "no-op" && result.totalSteps === 0) {
      yield* emitNoOpOutcome("subagents.install", {
        planName: result.planName,
        ...(result.planDescription === undefined
          ? {}
          : { planDescription: result.planDescription }),
        message: "No subagents installed.",
      });
      return;
    }

    yield* emitAppliedPlanOutcome({
      command: "subagents.install",
      headline:
        result.outcome === "no-op"
          ? unchangedPlanHeadline(resolution, "No subagents installed.")
          : "Installed subagent " + args.source.value,
      resolution,
      reportInstallationCoverage: true,
      suggestions: [{ description: "Inspect installed subagents", cmd: "axm subagents list" }],
    });
  });
