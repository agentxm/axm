import * as Effect from "effect/Effect";
import { runInstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";
import { toPlanResolutionResult } from "../../../json-output.js";
import { emitAppliedPlanOutcome, unchangedPlanHeadline } from "../../shared/applied-plan-output.js";
import { makeInstallPlanExecution } from "../../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import {
  InstallRuleCommandWorkflowActions,
  type InstallRuleHandlerArgs,
} from "./command-actions.js";

export const handleInstallRule = (
  args: InstallRuleHandlerArgs,
  flags: { readonly yes: boolean; readonly force: boolean; readonly preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* InstallRuleCommandWorkflowActions;
    const execution = yield* makeInstallPlanExecution(flags, ["rules", "install"], [args.source]);
    const resolution = yield* runInstallCommandWorkflow(args, actions, {
      execution,
      displayApplied: false,
    });
    const result = toPlanResolutionResult(resolution);
    if (result.outcome === "no-op" && result.totalSteps === 0) {
      yield* emitNoOpOutcome("rules.install", {
        planName: result.planName,
        message: "No rules installed.",
      });
      return;
    }
    yield* emitAppliedPlanOutcome({
      command: "rules.install",
      headline:
        result.outcome === "no-op"
          ? unchangedPlanHeadline(resolution, "No rules installed.")
          : "Installed rule " + args.source,
      resolution,
      reportInstallationCoverage: true,
      suggestions: [{ description: "Inspect installed rules", cmd: "axm rules list" }],
    });
  });
