import * as Effect from "effect/Effect";
import { runUninstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";
import { emitPlanResolutionResult } from "../../../json-output.js";
import {
  UninstallContextFilesCommandWorkflowActions,
  type UninstallContextFilesHandlerArgs,
} from "./command-actions.js";

export const handleUninstallContextFiles = (
  args: UninstallContextFilesHandlerArgs,
  flags: { readonly yes: boolean; readonly force: boolean; readonly preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallContextFilesCommandWorkflowActions;
    const resolution = yield* runUninstallCommandWorkflow(args, actions, flags);
    yield* emitPlanResolutionResult("context-files.uninstall", resolution);
  });
