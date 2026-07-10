import * as Effect from "effect/Effect";
import { runUninstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";

import { toPlanResolutionResult } from "../../../json-output.js";
import { emitAppliedPlanOutcome } from "../../shared/applied-plan-output.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import {
  UninstallCommandCommandWorkflowActions,
  type UninstallCommandHandlerArgs,
} from "./command-actions.js";

export const handleUninstallCommand = (
  args: UninstallCommandHandlerArgs,
  flags: { yes: boolean; force: boolean; preview: boolean; sourceDisposition?: "keep" | "delete" },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallCommandCommandWorkflowActions;
    const resolution = yield* runUninstallCommandWorkflow(args, actions, {
      ...flags,
      displayApplied: false,
    });
    const result = toPlanResolutionResult(resolution);
    if (result.outcome === "no-op") {
      yield* emitNoOpOutcome("commands.uninstall", {
        planName: result.planName,
        message: "No commands uninstalled.",
      });
      return;
    }

    yield* emitAppliedPlanOutcome({
      command: "commands.uninstall",
      headline: "Uninstalled command " + args.commandName,
      resolution,
      suggestions: [{ description: "Inspect installed commands", cmd: "axm commands list" }],
    });
  });
