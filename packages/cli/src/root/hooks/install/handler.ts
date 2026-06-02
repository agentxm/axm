import * as Effect from "effect/Effect";
import { runInstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";
import { emitPlanResolutionResult } from "../../../json-output.js";
import {
  InstallHookCommandWorkflowActions,
  type InstallHookHandlerArgs,
} from "./command-actions.js";

export const handleInstallHook = (
  args: InstallHookHandlerArgs,
  flags: { readonly yes: boolean; readonly force: boolean; readonly preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* InstallHookCommandWorkflowActions;
    const resolution = yield* runInstallCommandWorkflow(args, actions, flags);
    yield* emitPlanResolutionResult("hooks.install", resolution);
  });
