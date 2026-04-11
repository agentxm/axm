import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { runInstallCommandWorkflow } from "@axm.sh/core/unstable/workflows";

import { emitPlanResolutionResult } from "../../../json-output.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
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
      planName: "Install command(s)",
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
  });
  yield* emitPlanResolutionResult("commands.install", resolution);
});
