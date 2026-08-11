import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { runInstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";

import { toPlanResolutionResult } from "../../../json-output.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
import { emitAppliedPlanOutcome, unchangedPlanHeadline } from "../../shared/applied-plan-output.js";
import { makeInstallPlanExecutionMode } from "../../shared/confirmation-recovery.js";
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
    const execution = yield* makeInstallPlanExecutionMode(
      flags,
      ["packs", "install"],
      [args.source.value],
    );
    const resolution = yield* runInstallCommandWorkflow(sourceArgs, actions, {
      execution,
      displayApplied: false,
    });
    const result = toPlanResolutionResult(resolution);
    if (result.outcome === "no-op" && result.totalSteps === 0) {
      yield* emitNoOpOutcome("packs.install", {
        planName: result.planName,
        message: "No packs installed.",
      });
      return;
    }
    yield* emitAppliedPlanOutcome({
      command: "packs.install",
      headline:
        result.outcome === "no-op"
          ? unchangedPlanHeadline(resolution, "No packs installed.")
          : "Installed pack " + args.source.value,
      resolution,
      reportInstallationCoverage: true,
      suggestions: [{ description: "Inspect installed packs", cmd: "axm packs list" }],
    });
  });
