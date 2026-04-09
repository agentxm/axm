import * as Effect from "effect/Effect";
import { runInstallCommandWorkflow } from "@axm.sh/core/unstable/workflows";

import { emitPlanResolutionResult } from "../../../json-output.js";
import { InstallSubagentCommandWorkflowActions } from "./command-actions.js";
export interface InstallSubagentHandlerArgs {
  readonly source: string;
  readonly subagents: readonly string[];
  readonly all: boolean;
}
export const handleInstall = (
  args: InstallSubagentHandlerArgs,
  flags: { yes: boolean; force: boolean; preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* InstallSubagentCommandWorkflowActions;
    const resolution = yield* runInstallCommandWorkflow(args, actions, flags);
    yield* emitPlanResolutionResult("subagents.install", resolution);
  });
