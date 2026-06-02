import * as Effect from "effect/Effect";
import { runUninstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";
import { emitPlanResolutionResult } from "../../../json-output.js";
import {
  UninstallHookCommandWorkflowActions,
  type UninstallHookHandlerArgs,
} from "./command-actions.js";

export const handleUninstallHook = (
  args: UninstallHookHandlerArgs,
  flags: { readonly yes: boolean; readonly force: boolean; readonly preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallHookCommandWorkflowActions;
    const resolution = yield* runUninstallCommandWorkflow(args, actions, flags);
    yield* emitPlanResolutionResult("hooks.uninstall", resolution);
  });
