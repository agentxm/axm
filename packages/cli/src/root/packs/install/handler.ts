import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { runInstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";

import { emitPlanResolutionResult } from "../../../json-output.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
import {
  InstallPackCommandWorkflowActions,
  type InstallPackHandlerArgs,
} from "./command-actions.js";

export interface InstallPackFlags {
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export interface PackInstallHandlerArgs {
  readonly source: Option.Option<string>;
}

export const handleInstallPack = (args: PackInstallHandlerArgs, flags: InstallPackFlags) =>
  Effect.gen(function* () {
    if (Option.isNone(args.source)) {
      return yield* handleWorkspaceInstall({
        command: "packs.install",
        type: Option.some("pack"),
        planName: "Install pack(s)",
        planDescription: Option.some("Install configured packs"),
        flags,
      });
    }

    const actions = yield* InstallPackCommandWorkflowActions;
    const sourceArgs: InstallPackHandlerArgs = { source: args.source.value };
    const resolution = yield* runInstallCommandWorkflow(sourceArgs, actions, flags);
    yield* emitPlanResolutionResult("packs.install", resolution);
  });
