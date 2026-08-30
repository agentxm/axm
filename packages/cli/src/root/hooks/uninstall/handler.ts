import * as Effect from "effect/Effect";
import { operationPresentation } from "@agentxm/extension-management/unstable/plan";
import { runUninstallCommandWorkflow } from "@agentxm/extension-management/unstable/workflows";

import { emitOperationResolution } from "../../../operation-output.js";
import { withOperationLifecycle } from "../../shared/operation-lifecycle.js";
import { makeUninstallPlanExecution } from "../../shared/confirmation-recovery.js";
import {
  UninstallHookCommandWorkflowActions,
  type UninstallHookHandlerArgs,
} from "./command-actions.js";

const uninstallPresentation = operationPresentation(
  { imperative: "uninstall", past: "Uninstalled", gerund: "Uninstalling" },
  "hook",
);

export const handleUninstallHook = (
  args: UninstallHookHandlerArgs,
  flags: {
    readonly yes: boolean;
    readonly preview: boolean;
  },
) =>
  withOperationLifecycle(
    {
      command: "hooks.uninstall",
      mode: flags.preview ? "preview" : "apply",
      planName: "Uninstall hook",
      presentation: uninstallPresentation,
    },
    handleUninstallHookBody(args, flags),
  );

const handleUninstallHookBody = (
  args: UninstallHookHandlerArgs,
  flags: {
    readonly yes: boolean;
    readonly preview: boolean;
  },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallHookCommandWorkflowActions;
    const presentedActions: typeof actions = {
      ...actions,
      buildUninstallPlan: (intent, workflowFlags) =>
        actions
          .buildUninstallPlan(intent, workflowFlags)
          .pipe(Effect.map((plan) => ({ ...plan, presentation: uninstallPresentation }))),
    };
    const execution = yield* makeUninstallPlanExecution(flags, ["hooks", "uninstall"], [args.name]);
    const resolution = yield* runUninstallCommandWorkflow(args, presentedActions, { execution });
    yield* emitOperationResolution("hooks.uninstall", resolution, {
      suggestions: [{ description: "Inspect installed hooks packages", cmd: "axm hooks list" }],
    });
  });
