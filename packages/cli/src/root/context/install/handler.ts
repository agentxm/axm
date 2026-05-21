import * as Effect from "effect/Effect";
import { runInstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";
import { emitPlanResolutionResult } from "../../../json-output.js";
import {
  InstallContextCommandWorkflowActions,
  type InstallContextHandlerArgs,
} from "./command-actions.js";
import { runContextWorkspaceGeneratorPhase } from "../workspace-generator-phase.js";

export const handleInstallContext = (
  args: InstallContextHandlerArgs,
  flags: { readonly yes: boolean; readonly force: boolean; readonly preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* InstallContextCommandWorkflowActions;
    const resolution = yield* runInstallCommandWorkflow(args, actions, flags);
    if (!flags.preview) {
      yield* runContextWorkspaceGeneratorPhase({ dryRun: false });
    }
    yield* emitPlanResolutionResult("context.install", resolution);
  });
