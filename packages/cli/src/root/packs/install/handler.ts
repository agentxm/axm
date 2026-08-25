import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { deriveOperationOutcome } from "@agentxm/client-core/unstable/plan";
import { runInstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";

import { emitOperationResolution } from "../../../operation-output.js";
import { withOperationLifecycle } from "../../shared/operation-lifecycle.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
import { makeInstallPlanExecution } from "../../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
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
  withOperationLifecycle(
    {
      command: "packs.install",
      mode: flags.preview ? "preview" : "apply",
      planName: "Install packs",
    },
    handleInstallPackBody(args, flags),
  );

const handleInstallPackBody = (args: PackInstallHandlerArgs, flags: InstallPackFlags) =>
  Effect.gen(function* () {
    if (Option.isNone(args.source)) {
      return yield* handleWorkspaceInstall({
        command: "packs.install",
        type: Option.some("pack"),
        planName: "Install packs",
        planDescription: Option.some("Install configured packs"),
        flags,
      });
    }

    const actions = yield* InstallPackCommandWorkflowActions;
    const sourceArgs: InstallPackHandlerArgs = { source: args.source.value };
    const execution = yield* makeInstallPlanExecution(
      flags,
      ["packs", "install"],
      [args.source.value],
    );
    const resolution = yield* runInstallCommandWorkflow(sourceArgs, actions, {
      execution,
    });
    if (deriveOperationOutcome(resolution) === "no-op" && resolution.units.length === 0) {
      yield* emitNoOpOutcome("packs.install", {
        planName: resolution.name,
        message: "No packs installed.",
      });
      return;
    }
    yield* emitOperationResolution("packs.install", resolution, {
      suggestions: [{ description: "Inspect installed packs", cmd: "axm packs list" }],
    });
  });
