import * as Effect from "effect/Effect";
import { runUninstallCommandWorkflow } from "@axm.sh/core/unstable/workflows";

import { emitPlanResolutionResult } from "../../../json-output.js";
import {
  UninstallPackCommandWorkflowActions,
  type UninstallPackHandlerArgs,
} from "./command-actions.js";

export const handleUninstallPack = (
  args: UninstallPackHandlerArgs,
  flags: { yes: boolean; force: boolean; preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallPackCommandWorkflowActions;
    const resolution = yield* runUninstallCommandWorkflow(args, actions, flags);
    yield* emitPlanResolutionResult("packs.uninstall", resolution);
  });
