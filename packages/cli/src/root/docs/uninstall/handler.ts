import * as Effect from "effect/Effect";
import { runUninstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";
import { emitPlanResolutionResult } from "../../../json-output.js";
import {
  UninstallDocsCommandWorkflowActions,
  type UninstallDocsHandlerArgs,
} from "./command-actions.js";

export const handleUninstallDocs = (
  args: UninstallDocsHandlerArgs,
  flags: { readonly yes: boolean; readonly force: boolean; readonly preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallDocsCommandWorkflowActions;
    const resolution = yield* runUninstallCommandWorkflow(args, actions, flags);
    yield* emitPlanResolutionResult("docs.uninstall", resolution);
  });
