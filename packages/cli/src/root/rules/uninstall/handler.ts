import * as Effect from "effect/Effect";
import { deriveOperationOutcome, operationPresentation } from "@agentxm/workspace-operations";
import { runUninstallCommandWorkflow } from "@agentxm/extension-lifecycle";

import { emitOperationResolution } from "../../../operation-output.js";
import { withOperationLifecycle } from "../../shared/operation-lifecycle.js";
import { makeUninstallPlanExecution } from "../../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import {
  UninstallRuleCommandWorkflowActions,
  type UninstallRuleHandlerArgs,
} from "./command-actions.js";

const uninstallPresentation = operationPresentation(
  { imperative: "uninstall", past: "Uninstalled", gerund: "Uninstalling" },
  "rule",
);

export const handleUninstallRule = (
  args: UninstallRuleHandlerArgs,
  flags: {
    readonly preview: boolean;
  },
) =>
  withOperationLifecycle(
    {
      command: "rules.uninstall",
      mode: flags.preview ? "preview" : "apply",
      planName: "Uninstall rule",
      presentation: uninstallPresentation,
    },
    handleUninstallRuleBody(args, flags),
  );

const handleUninstallRuleBody = (
  args: UninstallRuleHandlerArgs,
  flags: {
    readonly preview: boolean;
  },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallRuleCommandWorkflowActions;
    const presentedActions: typeof actions = {
      ...actions,
      buildUninstallPlan: (intent, workflowFlags) =>
        actions
          .buildUninstallPlan(intent, workflowFlags)
          .pipe(Effect.map((plan) => ({ ...plan, presentation: uninstallPresentation }))),
    };
    const execution = yield* makeUninstallPlanExecution(flags, ["rules", "uninstall"], [args.name]);
    const resolution = yield* runUninstallCommandWorkflow(args, presentedActions, {
      execution,
    });
    if (deriveOperationOutcome(resolution) === "no-op") {
      yield* emitNoOpOutcome("rules.uninstall", {
        planName: resolution.name,
        message: "No rules uninstalled.",
      });
      return;
    }

    yield* emitOperationResolution("rules.uninstall", resolution, {
      suggestions: [{ description: "Inspect installed rules", cmd: "axm rules list" }],
    });
  });
