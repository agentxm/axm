import * as Effect from "effect/Effect";
import type { PlanResolution } from "@agentxm/client-core/unstable/plan";
import { runInstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";
import { toPlanResolutionResult } from "../../../json-output.js";
import { emitAppliedPlanOutcome, unchangedPlanHeadline } from "../../shared/applied-plan-output.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import {
  InstallFilesCommandWorkflowActions,
  type InstallFilesHandlerArgs,
} from "./command-actions.js";
import {
  mergePlanResolution,
  runFilesWorkspaceGeneratorPhase,
} from "../workspace-generator-phase.js";

export const handleInstallFiles = (
  args: InstallFilesHandlerArgs,
  flags: { readonly yes: boolean; readonly force: boolean; readonly preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* InstallFilesCommandWorkflowActions;
    const resolution = yield* runInstallCommandWorkflow(args, actions, {
      ...flags,
      displayApplied: false,
    });
    let outputResolution: PlanResolution = resolution;
    if (!flags.preview) {
      const workspaceGeneratorResolution = yield* runFilesWorkspaceGeneratorPhase({
        dryRun: false,
      });
      outputResolution = mergePlanResolution(resolution, workspaceGeneratorResolution);
    }
    const result = toPlanResolutionResult(outputResolution);
    if (result.outcome === "no-op" && result.totalSteps === 0) {
      yield* emitNoOpOutcome("files.install", {
        planName: result.planName,
        message: "No files packages installed.",
      });
      return;
    }
    yield* emitAppliedPlanOutcome({
      command: "files.install",
      headline:
        result.outcome === "no-op"
          ? unchangedPlanHeadline(outputResolution, "No files packages installed.")
          : "Installed files package " + args.source,
      resolution: outputResolution,
      reportInstallationCoverage: true,
      suggestions: [{ description: "Inspect installed files packages", cmd: "axm files list" }],
    });
  });
