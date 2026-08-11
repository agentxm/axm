import * as Effect from "effect/Effect";
import { runUninstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";
import { toPlanResolutionResult } from "../../../json-output.js";
import { emitAppliedPlanOutcome } from "../../shared/applied-plan-output.js";
import { makeUninstallPlanExecutionMode } from "../../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import {
  UninstallRuleCommandWorkflowActions,
  type UninstallRuleHandlerArgs,
} from "./command-actions.js";

export const handleUninstallRule = (
  args: UninstallRuleHandlerArgs,
  flags: {
    readonly yes: boolean;
    readonly force: boolean;
    readonly preview: boolean;
  },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallRuleCommandWorkflowActions;
    const execution = yield* makeUninstallPlanExecutionMode(
      flags,
      ["rules", "uninstall"],
      [args.name],
    );
    const resolution = yield* runUninstallCommandWorkflow(args, actions, {
      execution,
      displayApplied: false,
    });
    const result = toPlanResolutionResult(resolution);
    if (result.outcome === "no-op") {
      yield* emitNoOpOutcome("rules.uninstall", {
        planName: result.planName,
        message: "No rules uninstalled.",
      });
      return;
    }

    yield* emitAppliedPlanOutcome({
      command: "rules.uninstall",
      headline: "Uninstalled rule " + args.name,
      resolution,
      suggestions: [{ description: "Inspect installed rules", cmd: "axm rules list" }],
    });
  });
