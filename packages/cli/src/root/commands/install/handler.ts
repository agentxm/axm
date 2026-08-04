import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { runInstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";

import { toPlanResolutionResult } from "../../../json-output.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
import { emitAppliedPlanOutcome, unchangedPlanHeadline } from "../../shared/applied-plan-output.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import {
  InstallCommandCommandWorkflowActions,
  type InstallCommandHandlerArgs,
} from "./command-actions.js";

export interface CommandInstallHandlerArgs {
  readonly source: Option.Option<string>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export const handleInstallCommand = Effect.fn("InstallCommand.handle")(function* (
  args: CommandInstallHandlerArgs,
) {
  if (Option.isNone(args.source)) {
    return yield* handleWorkspaceInstall({
      command: "commands.install",
      type: Option.some("command"),
      planName: "Install commands",
      planDescription: Option.some("Install configured commands"),
      flags: args,
    });
  }

  const actions = yield* InstallCommandCommandWorkflowActions;
  const sourceArgs: InstallCommandHandlerArgs = {
    source: args.source.value,
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  };
  const resolution = yield* runInstallCommandWorkflow(sourceArgs, actions, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
    displayApplied: false,
  });
  const result = toPlanResolutionResult(resolution);
  if (result.outcome === "no-op" && result.totalSteps === 0) {
    yield* emitNoOpOutcome("commands.install", {
      planName: result.planName,
      message: "No commands installed.",
    });
    return;
  }
  yield* emitAppliedPlanOutcome({
    command: "commands.install",
    headline:
      result.outcome === "no-op"
        ? unchangedPlanHeadline(resolution, "No commands installed.")
        : "Installed command " + args.source.value,
    resolution,
    reportInstallationCoverage: true,
    suggestions: [{ description: "Inspect installed commands", cmd: "axm commands list" }],
  });
});
