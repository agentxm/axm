import * as Effect from "effect/Effect";
import { runUninstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";

import { toPlanResolutionResult } from "../../../json-output.js";
import { emitAppliedPlanOutcome } from "../../shared/applied-plan-output.js";
import { makeUninstallPlanExecutionMode } from "../../shared/confirmation-recovery.js";
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
    const execution = yield* makeUninstallPlanExecutionMode(
      flags,
      ["skills", "uninstall"],
      [args.skill],
    );
    const resolution = yield* runUninstallCommandWorkflow(args, actions, {
      execution,
      displayApplied: false,
    });
    const result = toPlanResolutionResult(resolution);
    const allStepsAlreadyAbsent =
      result.totalSteps > 0 &&
      result.steps.every((step) => step.message === "not installed" || step.status === "unchanged");
    if (result.outcome === "no-op" || allStepsAlreadyAbsent) {
      const literalAbsent = allStepsAlreadyAbsent && !args.skill.includes("*");
      yield* emitNoOpOutcome("skills.uninstall", {
        planName: result.planName,
        message: literalAbsent
          ? `No skills uninstalled; ${args.skill} is not installed.`
          : "No skills uninstalled.",
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
