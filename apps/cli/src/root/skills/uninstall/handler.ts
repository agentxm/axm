import * as Effect from "effect/Effect";
import { deriveOperationOutcome, operationPresentation } from "@agentxm/workspace-operations";
import { runUninstallCommandWorkflow } from "@agentxm/extension-lifecycle";

import { emitOperationResolution } from "../../../operation-output.js";
import { withOperationLifecycle } from "../../shared/operation-lifecycle.js";
import { makeUninstallPlanExecution } from "../../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import {
  UninstallSkillCommandWorkflowActions,
  type UninstallHandlerArgs,
} from "./command-actions.js";

const uninstallPresentation = operationPresentation(
  { imperative: "uninstall", past: "Uninstalled", gerund: "Uninstalling" },
  "skill",
);

export const handleUninstall = (args: UninstallHandlerArgs, flags: { preview: boolean }) =>
  withOperationLifecycle(
    {
      command: "skills.uninstall",
      mode: flags.preview ? "preview" : "apply",
      planName: "Uninstall skill",
      presentation: uninstallPresentation,
    },
    handleUninstallBody(args, flags),
  );

const handleUninstallBody = (args: UninstallHandlerArgs, flags: { preview: boolean }) =>
  Effect.gen(function* () {
    const actions = yield* UninstallSkillCommandWorkflowActions;
    const presentedActions: typeof actions = {
      ...actions,
      buildUninstallPlan: (intent, workflowFlags) =>
        actions
          .buildUninstallPlan(intent, workflowFlags)
          .pipe(Effect.map((plan) => ({ ...plan, presentation: uninstallPresentation }))),
    };
    const execution = yield* makeUninstallPlanExecution(
      flags,
      ["skills", "uninstall"],
      [args.skill],
    );
    const resolution = yield* runUninstallCommandWorkflow(args, presentedActions, {
      execution,
    });
    const allUnitsAlreadyAbsent =
      resolution.units.length > 0 &&
      resolution.units.every(
        (unit) => unit.message === "not installed" || unit.state === "unchanged",
      );
    if (deriveOperationOutcome(resolution) === "no-op" || allUnitsAlreadyAbsent) {
      const literalAbsent = allUnitsAlreadyAbsent && !args.skill.includes("*");
      yield* emitNoOpOutcome("skills.uninstall", {
        planName: resolution.name,
        message: literalAbsent
          ? `No skills uninstalled; ${args.skill} is not installed.`
          : "No skills uninstalled.",
      });
      return;
    }

    yield* emitOperationResolution("skills.uninstall", resolution, {
      suggestions: [{ description: "Inspect installed skills", cmd: "axm skills list" }],
    });
  });
