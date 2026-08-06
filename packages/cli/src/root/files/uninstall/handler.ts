import * as Effect from "effect/Effect";
import { runUninstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";
import { emitAppliedPlanOutcome } from "../../shared/applied-plan-output.js";
import {
  UninstallFilesCommandWorkflowActions,
  type UninstallFilesHandlerArgs,
} from "./command-actions.js";

export const handleUninstallFiles = (
  args: UninstallFilesHandlerArgs,
  flags: {
    readonly yes: boolean;
    readonly force: boolean;
    readonly preview: boolean;
  },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallFilesCommandWorkflowActions;
    const resolution = yield* runUninstallCommandWorkflow(args, actions, {
      ...flags,
      displayApplied: false,
    });
    yield* emitAppliedPlanOutcome({
      command: "files.uninstall",
      headline: "Uninstalled files package " + args.name,
      resolution,
      suggestions: [{ description: "Inspect installed files packages", cmd: "axm files list" }],
    });
  });
