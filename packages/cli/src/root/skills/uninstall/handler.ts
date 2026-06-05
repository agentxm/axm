import * as Effect from "effect/Effect";
import { runUninstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";

import { toPlanResolutionResult } from "../../../json-output.js";
import { emitAppliedPlanOutcome } from "../../shared/applied-plan-output.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import {
  UninstallSkillCommandWorkflowActions,
  type UninstallHandlerArgs,
} from "./command-actions.js";

export const handleUninstall = (
  args: UninstallHandlerArgs,
  flags: { yes: boolean; force: boolean; preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallSkillCommandWorkflowActions;
    const resolution = yield* runUninstallCommandWorkflow(args, actions, {
      ...flags,
      displayApplied: false,
    });
    const result = toPlanResolutionResult(resolution);
    const allStepsAlreadyAbsent =
      result.totalSteps > 0 &&
      result.steps.every((step) => step.message === "not installed" || step.status === "unchanged");
    if (result.outcome === "no-op" || allStepsAlreadyAbsent) {
      yield* emitNoOpOutcome("skills.uninstall", {
        planName: result.planName,
        message: "No skills uninstalled.",
      });
      return;
    }

    yield* emitAppliedPlanOutcome({
      command: "skills.uninstall",
      headline: "Uninstalled skill " + args.skill,
      resolution,
      suggestions: [{ description: "Inspect installed skills", cmd: "axm skills list" }],
    });
  });
