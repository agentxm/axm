import * as Effect from "effect/Effect";
import { runInstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";
import { emitPlanResolutionResult } from "../../../json-output.js";
import {
  InstallFilesCommandWorkflowActions,
  type InstallFilesHandlerArgs,
} from "./command-actions.js";
import { runFilesWorkspaceGeneratorPhase } from "../workspace-generator-phase.js";

export const handleInstallFiles = (
  args: InstallFilesHandlerArgs,
  flags: { readonly yes: boolean; readonly force: boolean; readonly preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* InstallFilesCommandWorkflowActions;
    const resolution = yield* runInstallCommandWorkflow(args, actions, flags);
    if (!flags.preview) {
      yield* runFilesWorkspaceGeneratorPhase({ dryRun: false });
    }
    yield* emitPlanResolutionResult("files.install", resolution);
  });
