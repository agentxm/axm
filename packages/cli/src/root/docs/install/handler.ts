import * as Effect from "effect/Effect";
import { runInstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";
import { emitPlanResolutionResult } from "../../../json-output.js";
import {
  InstallDocsCommandWorkflowActions,
  type InstallDocsHandlerArgs,
} from "./command-actions.js";
import { runDocsWorkspaceGeneratorPhase } from "../workspace-generator-phase.js";

export const handleInstallDocs = (
  args: InstallDocsHandlerArgs,
  flags: { readonly yes: boolean; readonly force: boolean; readonly preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* InstallDocsCommandWorkflowActions;
    const resolution = yield* runInstallCommandWorkflow(args, actions, flags);
    if (!flags.preview) {
      yield* runDocsWorkspaceGeneratorPhase({ dryRun: false });
    }
    yield* emitPlanResolutionResult("docs.install", resolution);
  });
