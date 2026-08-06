import * as Effect from "effect/Effect";
import { runUninstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";

import { toPlanResolutionResult } from "../../../json-output.js";
import { emitAppliedPlanOutcome } from "../../shared/applied-plan-output.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import {
  UninstallPackCommandWorkflowActions,
  type UninstallPackHandlerArgs,
} from "./command-actions.js";

export const handleUninstallPack = (
  args: UninstallPackHandlerArgs,
  flags: { yes: boolean; force: boolean; preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallPackCommandWorkflowActions;
    const resolution = yield* runUninstallCommandWorkflow(args, actions, {
      ...flags,
      displayApplied: false,
    });
    const result = toPlanResolutionResult(resolution);
    if (result.outcome === "no-op") {
      yield* emitNoOpOutcome("packs.uninstall", {
        planName: result.planName,
        message: "No packs uninstalled.",
      });
      return;
    }

    yield* emitAppliedPlanOutcome({
      command: "packs.uninstall",
      headline: "Uninstalled pack " + args.name,
      resolution,
      suggestions: [{ description: "Inspect installed packs", cmd: "axm packs list" }],
    });
  });
