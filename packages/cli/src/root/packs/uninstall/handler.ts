import * as Effect from "effect/Effect";
import { Screen, makeScreenOutput } from "../../../screen/index.js";
import { deriveOperationOutcome } from "@agentxm/workspace-operations";
import { runUninstallCommandWorkflow } from "@agentxm/extension-lifecycle";

import { emitOperationResolution } from "../../../operation-output.js";
import { withOperationLifecycle } from "../../shared/operation-lifecycle.js";
import { makeUninstallPlanExecution } from "../../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import {
  UninstallPackCommandWorkflowActions,
  type UninstallPackHandlerArgs,
} from "./command-actions.js";

export const handleUninstallPack = (
  args: UninstallPackHandlerArgs,
  flags: { yes: boolean; preview: boolean },
  testHooks?: { readonly beforeApply?: () => Effect.Effect<void, never> },
) =>
  withOperationLifecycle(
    {
      command: "packs.uninstall",
      mode: flags.preview ? "preview" : "apply",
      planName: "Uninstall pack",
    },
    handleUninstallPackBody(args, flags, testHooks),
  );

const handleUninstallPackBody = (
  args: UninstallPackHandlerArgs,
  flags: { yes: boolean; preview: boolean },
  testHooks?: { readonly beforeApply?: () => Effect.Effect<void, never> },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallPackCommandWorkflowActions;
    const execution = yield* makeUninstallPlanExecution(flags, ["packs", "uninstall"], [args.name]);
    const resolution = yield* runUninstallCommandWorkflow(args, actions, {
      execution,
      ...(testHooks?.beforeApply === undefined ? {} : { beforeApply: testHooks.beforeApply }),
    });
    if (resolution.mode === "preview" && resolution.units.length === 0) {
      const { emitted } = yield* emitOperationResolution("packs.uninstall", resolution);
      if (!emitted) {
        const screen = yield* Screen;
        const renderer = makeScreenOutput(screen);
        yield* renderer.success("No packs would be uninstalled.");
      }
      return;
    }
    if (deriveOperationOutcome(resolution) === "no-op") {
      yield* emitNoOpOutcome("packs.uninstall", {
        planName: resolution.name,
        message: "No packs uninstalled.",
      });
      return;
    }

    yield* emitOperationResolution("packs.uninstall", resolution, {
      suggestions: [{ description: "Inspect installed packs", cmd: "axm packs list" }],
    });
  });
