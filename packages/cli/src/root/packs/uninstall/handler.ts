import * as Effect from "effect/Effect";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { runUninstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";

import { emitPlanResolutionResult, toPlanResolutionResult } from "../../../json-output.js";
import { emitAppliedPlanOutcome } from "../../shared/applied-plan-output.js";
import { makeUninstallPlanExecution } from "../../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import {
  UninstallPackCommandWorkflowActions,
  type UninstallPackHandlerArgs,
} from "./command-actions.js";

export const handleUninstallPack = (
  args: UninstallPackHandlerArgs,
  flags: { yes: boolean; preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallPackCommandWorkflowActions;
    const execution = yield* makeUninstallPlanExecution(flags, ["packs", "uninstall"], [args.name]);
    const resolution = yield* runUninstallCommandWorkflow(args, actions, {
      execution,
      displayApplied: false,
    });
    const result = toPlanResolutionResult(resolution);
    if (resolution._tag === "PreviewedPlan" && result.totalSteps === 0) {
      const emitted = yield* emitPlanResolutionResult("packs.uninstall", resolution);
      if (!emitted) {
        const renderer = yield* CliRenderer;
        yield* renderer.success("No packs would be uninstalled.");
      }
      return;
    }
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
