import * as Effect from "effect/Effect";
import { runInstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";
import { toPlanResolutionResult } from "../../../json-output.js";
import { emitAppliedPlanOutcome, unchangedPlanHeadline } from "../../shared/applied-plan-output.js";
import { makeInstallPlanExecutionMode } from "../../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import {
  InstallHookCommandWorkflowActions,
  type InstallHookHandlerArgs,
} from "./command-actions.js";

export const handleInstallHook = (
  args: InstallHookHandlerArgs,
  flags: { readonly yes: boolean; readonly force: boolean; readonly preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* InstallHookCommandWorkflowActions;
    const execution = yield* makeInstallPlanExecutionMode(
      flags,
      ["hooks", "install"],
      [args.source],
    );
    const resolution = yield* runInstallCommandWorkflow(args, actions, {
      execution,
      displayApplied: false,
    });
    const result = toPlanResolutionResult(resolution);
    if (result.outcome === "no-op" && result.totalSteps === 0) {
      yield* emitNoOpOutcome("hooks.install", {
        planName: result.planName,
        message: "No hooks packages installed.",
      });
      return;
    }
    yield* emitAppliedPlanOutcome({
      command: "hooks.install",
      headline:
        result.outcome === "no-op"
          ? unchangedPlanHeadline(resolution, "No hooks packages installed.")
          : "Installed hooks package " + args.source,
      resolution,
      reportInstallationCoverage: true,
      suggestions: [{ description: "Inspect installed hooks packages", cmd: "axm hooks list" }],
    });
  });
