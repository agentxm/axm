import * as Effect from "effect/Effect";
import { runUninstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";
import { emitAppliedPlanOutcome } from "../../shared/applied-plan-output.js";
import {
  UninstallHookCommandWorkflowActions,
  type UninstallHookHandlerArgs,
} from "./command-actions.js";

export const handleUninstallHook = (
  args: UninstallHookHandlerArgs,
  flags: {
    readonly yes: boolean;
    readonly force: boolean;
    readonly preview: boolean;
  },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallHookCommandWorkflowActions;
    const resolution = yield* runUninstallCommandWorkflow(args, actions, {
      ...flags,
      displayApplied: false,
    });
    yield* emitAppliedPlanOutcome({
      command: "hooks.uninstall",
      headline: "Uninstalled hooks package " + args.name,
      resolution,
      suggestions: [{ description: "Inspect installed hooks packages", cmd: "axm hooks list" }],
    });
  });
