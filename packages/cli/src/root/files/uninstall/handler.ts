import * as Effect from "effect/Effect";
import { runUninstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";
import { emitPlanResolutionResult } from "../../../json-output.js";
import {
  UninstallFilesCommandWorkflowActions,
  type UninstallFilesHandlerArgs,
} from "./command-actions.js";

export const handleUninstallFiles = (
  args: UninstallFilesHandlerArgs,
  flags: { readonly yes: boolean; readonly force: boolean; readonly preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallFilesCommandWorkflowActions;
    const resolution = yield* runUninstallCommandWorkflow(args, actions, flags);
    yield* emitPlanResolutionResult("files.uninstall", resolution);
  });
