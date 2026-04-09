import * as Effect from "effect/Effect";
import { runInstallCommandWorkflow } from "@axm.sh/core/unstable/workflows";

import { emitPlanResolutionResult } from "../../../json-output.js";
import { InstallSkillCommandWorkflowActions } from "./command-actions.js";
export interface InstallHandlerArgs {
  readonly source: string;
  readonly skills: readonly string[];
  readonly all: boolean;
}
export const handleInstall = (
  args: InstallHandlerArgs,
  flags: { yes: boolean; force: boolean; preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* InstallSkillCommandWorkflowActions;
    const resolution = yield* runInstallCommandWorkflow(args, actions, flags);
    yield* emitPlanResolutionResult("skills.install", resolution);
  });
