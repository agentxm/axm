import * as Effect from "effect/Effect";
import { runInstallCommandWorkflow } from "@axm.sh/core/unstable/workflows";

import { emitPlanResolutionResult } from "../../../json-output.js";
import {
  InstallPackCommandWorkflowActions,
  type InstallPackHandlerArgs,
} from "./command-actions.js";

export const handleInstallPack = (
  args: InstallPackHandlerArgs,
  flags: { yes: boolean; force: boolean; preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* InstallPackCommandWorkflowActions;
    const resolution = yield* runInstallCommandWorkflow(args, actions, flags);
    yield* emitPlanResolutionResult("packs.install", resolution);
  });
