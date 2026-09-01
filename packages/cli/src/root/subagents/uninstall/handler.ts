import * as Effect from "effect/Effect";
import {
  deriveOperationOutcome,
  operationPresentation,
} from "@agentxm/extension-management/unstable/plan";
import { runUninstallCommandWorkflow } from "@agentxm/extension-management/unstable/extension-lifecycle";

import { emitOperationResolution } from "../../../operation-output.js";
import { withOperationLifecycle } from "../../shared/operation-lifecycle.js";
import { makeUninstallPlanExecution } from "../../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import {
  UninstallSubagentCommandWorkflowActions,
  type UninstallSubagentHandlerArgs,
} from "./command-actions.js";

const uninstallPresentation = operationPresentation(
  { imperative: "uninstall", past: "Uninstalled", gerund: "Uninstalling" },
  "subagent",
);

export const handleUninstall = (
  args: UninstallSubagentHandlerArgs,
  flags: { yes: boolean; preview: boolean },
) =>
  withOperationLifecycle(
    {
      command: "subagents.uninstall",
      mode: flags.preview ? "preview" : "apply",
      planName: "Uninstall subagent",
      presentation: uninstallPresentation,
    },
    handleUninstallBody(args, flags),
  );

const handleUninstallBody = (
  args: UninstallSubagentHandlerArgs,
  flags: { yes: boolean; preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallSubagentCommandWorkflowActions;
    const presentedActions: typeof actions = {
      ...actions,
      buildUninstallPlan: (intent, workflowFlags) =>
        actions
          .buildUninstallPlan(intent, workflowFlags)
          .pipe(Effect.map((plan) => ({ ...plan, presentation: uninstallPresentation }))),
    };
    const execution = yield* makeUninstallPlanExecution(
      flags,
      ["subagents", "uninstall"],
      [args.subagent],
    );
    const resolution = yield* runUninstallCommandWorkflow(args, presentedActions, {
      execution,
    });
    if (deriveOperationOutcome(resolution) === "no-op" && resolution.units.length === 0) {
      yield* emitNoOpOutcome("subagents.uninstall", {
        planName: resolution.name,
        message: "No subagents uninstalled.",
      });
      return;
    }

    yield* emitOperationResolution("subagents.uninstall", resolution, {
      suggestions: [{ description: "Inspect installed subagents", cmd: "axm subagents list" }],
    });
  });
