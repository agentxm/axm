import * as Effect from "effect/Effect";
import { runUninstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";
import { emitAppliedPlanOutcome } from "../../shared/applied-plan-output.js";
import { makeUninstallPlanExecution } from "../../shared/confirmation-recovery.js";
import {
  UninstallHookCommandWorkflowActions,
  type UninstallHookHandlerArgs,
} from "./command-actions.js";

export const handleUninstallHook = (
  args: UninstallHookHandlerArgs,
  flags: {
    readonly yes: boolean;
    readonly preview: boolean;
  },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallHookCommandWorkflowActions;
    const execution = yield* makeUninstallPlanExecution(flags, ["hooks", "uninstall"], [args.name]);
    const resolution = yield* runUninstallCommandWorkflow(args, actions, {
      execution,
      displayApplied: false,
    });
    yield* emitAppliedPlanOutcome({
      command: "hooks.uninstall",
      headline: "Uninstalled hooks package " + args.name,
      resolution,
      suggestions: [{ description: "Inspect installed hooks packages", cmd: "axm hooks list" }],
    });
  });
