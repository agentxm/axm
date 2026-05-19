import * as Effect from "effect/Effect";
import { runInstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";
import { emitPlanResolutionResult } from "../../../json-output.js";
import {
  InstallContextFilesCommandWorkflowActions,
  type InstallContextFilesHandlerArgs,
} from "./command-actions.js";
import { runContextFilesWorkspaceGeneratorPhase } from "../workspace-generator-phase.js";

export const handleInstallContextFiles = (
  args: InstallContextFilesHandlerArgs,
  flags: { readonly yes: boolean; readonly force: boolean; readonly preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* InstallContextFilesCommandWorkflowActions;
    const resolution = yield* runInstallCommandWorkflow(args, actions, flags);
    if (!flags.preview) {
      yield* runContextFilesWorkspaceGeneratorPhase({ dryRun: false });
    }
    yield* emitPlanResolutionResult("context-files.install", resolution);
  });
