import * as Effect from "effect/Effect";
import { runUninstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";

import { toPlanResolutionResult } from "../../../json-output.js";
import { emitAppliedPlanOutcome } from "../../shared/applied-plan-output.js";
import { makeUninstallPlanExecution } from "../../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import {
  UninstallSubagentCommandWorkflowActions,
  type UninstallSubagentHandlerArgs,
} from "./command-actions.js";

export const handleUninstall = (
  args: UninstallSubagentHandlerArgs,
  flags: { yes: boolean; force: boolean; preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallSubagentCommandWorkflowActions;
    const execution = yield* makeUninstallPlanExecution(
      flags,
      ["subagents", "uninstall"],
      [args.subagent],
    );
    const resolution = yield* runUninstallCommandWorkflow(args, actions, {
      execution,
      breakDependencies: flags.force,
      displayApplied: false,
    });
    const result = toPlanResolutionResult(resolution);
    if (result.outcome === "no-op" && result.totalSteps === 0) {
      yield* emitNoOpOutcome("subagents.uninstall", {
        planName: result.planName,
        message: "No subagents uninstalled.",
      });
      return;
    }

    yield* emitAppliedPlanOutcome({
      command: "subagents.uninstall",
      headline: "Uninstalled subagent " + args.subagent,
      resolution,
      suggestions: [{ description: "Inspect installed subagents", cmd: "axm subagents list" }],
    });
  });
