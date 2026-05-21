import * as Effect from "effect/Effect";
import { runUninstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";
import { emitPlanResolutionResult } from "../../../json-output.js";
import {
  UninstallContextCommandWorkflowActions,
  type UninstallContextHandlerArgs,
} from "./command-actions.js";

export const handleUninstallContext = (
  args: UninstallContextHandlerArgs,
  flags: { readonly yes: boolean; readonly force: boolean; readonly preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallContextCommandWorkflowActions;
    const resolution = yield* runUninstallCommandWorkflow(args, actions, flags);
    yield* emitPlanResolutionResult("context.uninstall", resolution);
  });
