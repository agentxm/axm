import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { runInstallCommandWorkflow } from "@axm.sh/core/unstable/workflows";

import { emitPlanResolutionResult } from "../../../json-output.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
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
        code: "SUBAGENTS_INSTALL_ALL_REQUIRES_SOURCE",
        what: "The --all flag requires a source for subagents install",
        howToFix:
          "Run `axm subagents install <source> --all` or omit --all to install all configured subagents.",
      });
    }

    if (args.subagents.length > 0) {
      return yield* makeAppError({
        code: "SUBAGENTS_INSTALL_SELECTOR_REQUIRES_SOURCE",
        what: "The --subagent flag requires a source for subagents install",
        howToFix:
          "Run `axm subagents install <source> --subagent <name>` or omit --subagent to install all configured subagents.",
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
        planName: "Install subagent(s)",
        planDescription: Option.some("Install configured subagents"),
        flags,
      });
    }

    const actions = yield* InstallSubagentCommandWorkflowActions;
    const resolution = yield* runInstallCommandWorkflow(
      { source: args.source.value, subagents: args.subagents, all: args.all },
      actions,
      flags,
    );
    yield* emitPlanResolutionResult("subagents.install", resolution);
  });
